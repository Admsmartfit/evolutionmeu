import { AuditReportFindDto } from '@api/dto/auditReport.dto';
import { AuditOccurrenceContextService } from '@api/services/auditOccurrenceContext.service';
import { AuditReportService } from '@api/services/auditReport.service';

export class AuditReportController {
  constructor(
    private readonly auditReportService: AuditReportService,
    private readonly auditOccurrenceContextService: AuditOccurrenceContextService,
  ) {}

  public async find(query: AuditReportFindDto) {
    return this.auditReportService.find(query);
  }

  public async findById({ reportId }: { reportId: string }) {
    return this.auditReportService.findById(reportId);
  }

  public async delete({ reportId }: { reportId: string }) {
    return this.auditReportService.delete(reportId);
  }

  public async getPdfBuffer({ reportId }: { reportId: string }) {
    return this.auditReportService.getPdfBuffer(reportId);
  }

  public async getOccurrenceContext({ reportId, occurrenceIndex }: { reportId: string; occurrenceIndex: string }) {
    return this.auditOccurrenceContextService.getContextForOccurrence(reportId, Number(occurrenceIndex));
  }
}
