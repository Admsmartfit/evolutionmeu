import { AuditRecipientDto, AuditRecipientFindDto, AuditRecipientUpdateDto } from '@api/dto/auditRecipient.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { BadRequestException, NotFoundException } from '@exceptions';
import { normalizePhoneNumber } from '@utils/phoneNumber';
import { AUDIT_RECIPIENT_TRIGGER_CONDITIONS } from '@validate/auditRecipient.schema';

export class AuditRecipientService {
  constructor(private readonly prismaRepository: PrismaRepository) {}

  public async create(data: AuditRecipientDto) {
    const phoneNumber = normalizePhoneNumber(data.phoneNumber);
    const triggerCondition = this.resolveTriggerCondition(data.triggerCondition);

    return this.prismaRepository.auditRecipient.create({
      data: {
        name: data.name,
        phoneNumber,
        role: data.role,
        triggerCondition,
        active: data.active ?? true,
      },
    });
  }

  public async update(recipientId: string, data: AuditRecipientUpdateDto) {
    await this.findByIdOrThrow(recipientId);

    return this.prismaRepository.auditRecipient.update({
      where: { id: recipientId },
      data: {
        name: data.name,
        phoneNumber: data.phoneNumber ? normalizePhoneNumber(data.phoneNumber) : undefined,
        role: data.role,
        triggerCondition: data.triggerCondition ? this.resolveTriggerCondition(data.triggerCondition) : undefined,
        active: data.active,
      },
    });
  }

  public async delete(recipientId: string) {
    await this.findByIdOrThrow(recipientId);

    await this.prismaRepository.auditRecipient.delete({ where: { id: recipientId } });

    return { recipientId, deleted: true };
  }

  public async find(query: AuditRecipientFindDto) {
    return this.prismaRepository.auditRecipient.findMany({
      where: {
        active: query?.active !== undefined ? query.active === 'true' : undefined,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private resolveTriggerCondition(triggerCondition?: string): string {
    const value = triggerCondition || 'ALWAYS';

    if (!AUDIT_RECIPIENT_TRIGGER_CONDITIONS.includes(value)) {
      throw new BadRequestException(
        `Invalid triggerCondition: "${triggerCondition}". Expected one of: ${AUDIT_RECIPIENT_TRIGGER_CONDITIONS.join(', ')}`,
      );
    }

    return value;
  }

  private async findByIdOrThrow(recipientId: string) {
    const recipient = await this.prismaRepository.auditRecipient.findUnique({ where: { id: recipientId } });

    if (!recipient) {
      throw new NotFoundException(`AuditRecipient not found: "${recipientId}"`);
    }

    return recipient;
  }
}
