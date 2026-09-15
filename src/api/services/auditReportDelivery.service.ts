import { Logger } from '@config/logger.config';
import { getErrorMessage } from '@utils/getErrorMessage';

import { AuditWhatsAppMessageInput, buildAuditWhatsAppMessage } from './auditWhatsAppMessage';
import { WAMonitoringService } from './monitor.service';

// WhatsApp caps media captions around 1024 characters; stay safely under that.
const MAX_CAPTION_LENGTH = 1000;

function truncateCaption(text: string): string {
  if (text.length <= MAX_CAPTION_LENGTH) return text;

  return text.slice(0, MAX_CAPTION_LENGTH - 40) + '\n\n[...] Relatório completo no PDF anexo.';
}

export type AuditReportDeliveryParams = AuditWhatsAppMessageInput & {
  reportId: string;
  senderInstanceName: string | null;
  recipientPhoneNumber: string | null;
  overallRiskLevel: string | null;
  pdfBuffer: Buffer;
};

export type AuditReportDeliveryResult = {
  sent: boolean;
  skippedReason?: string;
  failedReason?: string;
};

/**
 * Sends the PDF report as a single WhatsApp document message, with the executive summary
 * (RF08.3, PRD section 8.1) as its caption, through the AuditConfig's own senderInstanceName
 * to its own recipientPhoneNumber — and ONLY those. Both come from the audit rule itself, set
 * once by an admin with the global API key; delivery never falls back to guessing an instance
 * (e.g. "whichever audited instance happens to be first") or to a shared/editable recipient
 * list, since either would let a report reach a number or leave through an instance nobody
 * explicitly approved for it. If either field is unset, delivery is skipped — never inferred.
 */
export class AuditReportDeliveryService {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  private readonly logger = new Logger('AuditReportDeliveryService');

  public async deliver(params: AuditReportDeliveryParams): Promise<AuditReportDeliveryResult> {
    if (!params.senderInstanceName || !params.recipientPhoneNumber) {
      const reason =
        'AuditConfig has no senderInstanceName and/or recipientPhoneNumber configured; skipping WhatsApp delivery.';
      this.logger.warn(`Audit report ${params.reportId}: ${reason}`);
      return { sent: false, skippedReason: reason };
    }

    const instance = this.waMonitor.waInstances[params.senderInstanceName];
    if (!instance) {
      const reason = `Instance "${params.senderInstanceName}" is not connected.`;
      this.logger.warn(`Audit report ${params.reportId}: ${reason} Skipping delivery.`);
      return { sent: false, skippedReason: reason };
    }

    const caption = truncateCaption(buildAuditWhatsAppMessage(params));
    const base64Pdf = params.pdfBuffer.toString('base64');
    const fileName = `auditoria-compliance-${params.reportId}.pdf`;

    try {
      await instance.mediaMessage({
        number: params.recipientPhoneNumber,
        mediatype: 'document',
        fileName,
        caption,
        media: base64Pdf,
      });

      return { sent: true };
    } catch (error) {
      const reason = getErrorMessage(error);
      this.logger.error(
        `Failed to deliver audit report ${params.reportId} to ${params.recipientPhoneNumber}: ${reason}`,
      );
      return { sent: false, failedReason: reason };
    }
  }
}
