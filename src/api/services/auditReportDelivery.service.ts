import { PrismaRepository } from '@api/repository/repository.service';
import { Logger } from '@config/logger.config';
import { getErrorMessage } from '@utils/getErrorMessage';

import { AuditWhatsAppMessageInput, buildAuditWhatsAppMessage } from './auditWhatsAppMessage';
import { WAMonitoringService } from './monitor.service';

const HIGH_RISK_LEVELS = ['HIGH', 'CRITICAL'];
// WhatsApp caps media captions around 1024 characters; stay safely under that.
const MAX_CAPTION_LENGTH = 1000;
// Gap between different recipients so a report with several recipients doesn't
// blast them all in immediate succession — on top of the per-send typing
// simulation baileys already runs before each individual message.
const RECIPIENT_DELAY_MS = 15000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateCaption(text: string): string {
  if (text.length <= MAX_CAPTION_LENGTH) return text;

  return text.slice(0, MAX_CAPTION_LENGTH - 40) + '\n\n[...] Relatório completo no PDF anexo.';
}

export type AuditReportDeliveryParams = AuditWhatsAppMessageInput & {
  reportId: string;
  senderInstanceName: string | null;
  overallRiskLevel: string | null;
  pdfBuffer: Buffer;
};

export type AuditReportDeliveryResult = {
  sent: string[];
  skipped: string[];
  failed: { recipient: string; reason: string }[];
};

/**
 * Sends the PDF report as a single WhatsApp document message, with the executive
 * summary (RF08.3, PRD section 8.1) as its caption, to every active AuditRecipient
 * whose triggerCondition matches the report's risk level. This is intentionally
 * ONE message per recipient, not a text message followed by a separate document —
 * two messages fired back-to-back looks like automated/bulk behavior to WhatsApp's
 * abuse detection and risks the sending account getting flagged or banned. Delivery
 * is best-effort per recipient: one failure (bad number, disconnected instance)
 * never blocks the others.
 */
export class AuditReportDeliveryService {
  constructor(
    private readonly prismaRepository: PrismaRepository,
    private readonly waMonitor: WAMonitoringService,
  ) {}

  private readonly logger = new Logger('AuditReportDeliveryService');

  public async deliver(params: AuditReportDeliveryParams): Promise<AuditReportDeliveryResult> {
    const result: AuditReportDeliveryResult = { sent: [], skipped: [], failed: [] };

    const recipients = await this.prismaRepository.auditRecipient.findMany({ where: { active: true } });
    if (recipients.length === 0) return result;

    if (!params.senderInstanceName) {
      this.logger.warn(`Audit report ${params.reportId}: no instance available to send WhatsApp notifications.`);
      return result;
    }

    const instance = this.waMonitor.waInstances[params.senderInstanceName];
    if (!instance) {
      this.logger.warn(
        `Audit report ${params.reportId}: instance "${params.senderInstanceName}" is not connected, skipping delivery.`,
      );
      return result;
    }

    const caption = truncateCaption(buildAuditWhatsAppMessage(params));
    const base64Pdf = params.pdfBuffer.toString('base64');
    const fileName = `auditoria-compliance-${params.reportId}.pdf`;

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];

      if (!this.shouldNotify(recipient.triggerCondition, params.overallRiskLevel)) {
        result.skipped.push(recipient.name);
        continue;
      }

      try {
        await instance.mediaMessage({
          number: recipient.phoneNumber,
          mediatype: 'document',
          fileName,
          caption,
          media: base64Pdf,
        });

        result.sent.push(recipient.name);
      } catch (error) {
        const reason = getErrorMessage(error);
        this.logger.error(`Failed to deliver audit report ${params.reportId} to ${recipient.name}: ${reason}`);
        result.failed.push({ recipient: recipient.name, reason });
      }

      if (i < recipients.length - 1) await sleep(RECIPIENT_DELAY_MS);
    }

    return result;
  }

  private shouldNotify(triggerCondition: string, overallRiskLevel: string | null): boolean {
    if (triggerCondition === 'ONLY_HIGH_CRITICAL') {
      return HIGH_RISK_LEVELS.includes(overallRiskLevel || '');
    }

    return true;
  }
}
