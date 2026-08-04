import { PrismaRepository } from '@api/repository/repository.service';
import { Logger } from '@config/logger.config';
import { getErrorMessage } from '@utils/getErrorMessage';

import { AuditWhatsAppMessageInput, buildAuditWhatsAppMessage } from './auditWhatsAppMessage';
import { WAMonitoringService } from './monitor.service';

const HIGH_RISK_LEVELS = ['HIGH', 'CRITICAL'];

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
 * Sends the executive text message (RF08.3, PRD section 8.1) + the PDF report as a
 * WhatsApp document to every active AuditRecipient whose triggerCondition matches
 * the report's risk level. Delivery is best-effort per recipient: one failure (bad
 * number, disconnected instance) never blocks the others.
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

    const messageText = buildAuditWhatsAppMessage(params);
    const base64Pdf = params.pdfBuffer.toString('base64');
    const fileName = `auditoria-compliance-${params.reportId}.pdf`;

    for (const recipient of recipients) {
      if (!this.shouldNotify(recipient.triggerCondition, params.overallRiskLevel)) {
        result.skipped.push(recipient.name);
        continue;
      }

      try {
        await instance.textMessage({ number: recipient.phoneNumber, text: messageText });
        await instance.mediaMessage({
          number: recipient.phoneNumber,
          mediatype: 'document',
          fileName,
          media: base64Pdf,
        });

        result.sent.push(recipient.name);
      } catch (error) {
        const reason = getErrorMessage(error);
        this.logger.error(`Failed to deliver audit report ${params.reportId} to ${recipient.name}: ${reason}`);
        result.failed.push({ recipient: recipient.name, reason });
      }
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
