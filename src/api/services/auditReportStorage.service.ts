import { BUCKET, getObjectUrl, uploadFile } from '@api/integrations/storage/s3/libs/minio.server';
import { Logger } from '@config/logger.config';

/**
 * Persists the generated audit report PDF (RF08.2) to S3/MinIO so it has a stable,
 * shareable URL. Storage is optional (S3_ENABLED can be false) — the PDF is
 * regenerated on demand from the AuditReport row whenever it's needed, so a missing
 * URL never blocks the rest of the pipeline, it just means no persisted download link.
 */
export class AuditReportStorageService {
  private readonly logger = new Logger('AuditReportStorageService');

  public async uploadReportPdf(reportId: string, pdfBuffer: Buffer): Promise<string | null> {
    if (!BUCKET?.ENABLE) {
      this.logger.warn(
        'S3/MinIO is not enabled (S3_ENABLED=false) - the audit report PDF will not be persisted with a public URL.',
      );
      return null;
    }

    const fileName = `audit-reports/${reportId}.pdf`;

    try {
      await uploadFile(fileName, pdfBuffer, pdfBuffer.length, { 'Content-Type': 'application/pdf' });

      return (await getObjectUrl(fileName)) || null;
    } catch (error) {
      this.logger.error(`Failed to upload audit report PDF: ${(error as Error).message}`);
      return null;
    }
  }
}
