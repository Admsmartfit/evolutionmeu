import { AuditRecipientDto, AuditRecipientFindDto, AuditRecipientUpdateDto } from '@api/dto/auditRecipient.dto';
import { AuditRecipientService } from '@api/services/auditRecipient.service';

export class AuditRecipientController {
  constructor(private readonly auditRecipientService: AuditRecipientService) {}

  public async create(data: AuditRecipientDto) {
    return this.auditRecipientService.create(data);
  }

  public async update({ recipientId }: { recipientId: string }, data: AuditRecipientUpdateDto) {
    return this.auditRecipientService.update(recipientId, data);
  }

  public async delete({ recipientId }: { recipientId: string }) {
    return this.auditRecipientService.delete(recipientId);
  }

  public async find(query: AuditRecipientFindDto) {
    return this.auditRecipientService.find(query);
  }
}
