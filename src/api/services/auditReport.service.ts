import { AuditReportFindDto } from '@api/dto/auditReport.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { NotFoundException } from '@exceptions';

import { AuditReportPdfService } from './auditReportPdf.service';
import { AuditAiExecutiveSummary, AuditAiOccurrence } from './baseAuditAiProvider.service';

const LIST_SELECT = {
  id: true,
  auditConfigId: true,
  executionDate: true,
  periodStart: true,
  periodEnd: true,
  instancesAudited: true,
  overallRiskLevel: true,
  riskMatrix: true,
  status: true,
  pdfStorageUrl: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Read-only access to AuditReport rows (RF08 history) plus on-demand PDF rendering.
 * Regenerating the PDF from the stored row is cheap and deterministic — all the
 * AI-derived fields (executiveSummary, occurrencesDetails, riskMatrix) are already
 * persisted, so no AI call is needed to produce the PDF again for a "view" action.
 */
export class AuditReportService {
  constructor(
    private readonly prismaRepository: PrismaRepository,
    private readonly pdfService: AuditReportPdfService = new AuditReportPdfService(),
  ) {}

  public async find(query: AuditReportFindDto) {
    return this.prismaRepository.auditReport.findMany({
      where: {
        status: query?.status || undefined,
        overallRiskLevel: query?.overallRiskLevel || undefined,
      },
      orderBy: { executionDate: 'desc' },
      select: LIST_SELECT,
    });
  }

  public async findById(reportId: string) {
    const report = await this.prismaRepository.auditReport.findUnique({ where: { id: reportId } });

    if (!report) {
      throw new NotFoundException(`AuditReport not found: "${reportId}"`);
    }

    return report;
  }

  public async getPdfBuffer(reportId: string): Promise<Buffer> {
    const report = await this.findById(reportId);

    return this.pdfService.generate({
      id: report.id,
      executionDate: report.executionDate,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      instancesAudited: report.instancesAudited as string[] | null,
      overallRiskLevel: report.overallRiskLevel,
      riskMatrix: report.riskMatrix as Record<string, number> | null,
      executiveSummary: report.executiveSummary as AuditAiExecutiveSummary | null,
      occurrencesDetails: report.occurrencesDetails as AuditAiOccurrence[] | null,
    });
  }
}
