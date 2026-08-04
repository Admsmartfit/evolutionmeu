import { AuditConfigDto, AuditConfigFindDto, AuditConfigUpdateDto } from '@api/dto/auditConfig.dto';
import { AuditConfigService } from '@api/services/auditConfig.service';

export class AuditConfigController {
  constructor(private readonly auditConfigService: AuditConfigService) {}

  public async create(data: AuditConfigDto) {
    return this.auditConfigService.create(data);
  }

  public async update({ auditConfigId }: { auditConfigId: string }, data: AuditConfigUpdateDto) {
    return this.auditConfigService.update(auditConfigId, data);
  }

  public async delete({ auditConfigId }: { auditConfigId: string }) {
    return this.auditConfigService.delete(auditConfigId);
  }

  public async find(query: AuditConfigFindDto) {
    return this.auditConfigService.find(query);
  }

  public async runNow(
    { auditConfigId }: { auditConfigId: string },
    data?: { periodStart?: string; periodEnd?: string },
  ) {
    return this.auditConfigService.runNow(auditConfigId, data);
  }
}
