import { AuditReportFindDto } from '@api/dto/auditReport.dto';
import { AuditReportService } from '@api/services/auditReport.service';

export class AuditReportController {
  constructor(private readonly auditReportService: AuditReportService) {}

  public async find(query: AuditReportFindDto) {
    return this.auditReportService.find(query);
  }

  public async findById({ reportId }: { reportId: string }) {
    return this.auditReportService.findById(reportId);
  }

  public async getPdfBuffer({ reportId }: { reportId: string }) {
    return this.auditReportService.getPdfBuffer(reportId);
  }
}
