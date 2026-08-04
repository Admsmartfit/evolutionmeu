import {
  ContactRoleMappingDto,
  ContactRoleMappingFindDto,
  ContactRoleMappingUpdateDto,
} from '@api/dto/contactRoleMapping.dto';
import { PrismaRepository } from '@api/repository/repository.service';
import { Logger } from '@config/logger.config';
import { BadRequestException, NotFoundException } from '@exceptions';
import { getErrorMessage } from '@utils/getErrorMessage';
import { normalizePhoneNumber } from '@utils/phoneNumber';
import { CONTACT_ROLES } from '@validate/contactRoleMapping.schema';
import { parse } from 'csv-parse/sync';

export type ContactRoleMappingCsvRow = {
  Nome?: string;
  Telefone: string;
  Papel: string;
  Instancia?: string;
};

export type ContactRoleMappingImportResult = {
  imported: number;
  updated: number;
  skipped: { row: number; reason: string }[];
};

export class ContactRoleMappingService {
  constructor(private readonly prismaRepository: PrismaRepository) {}

  private readonly logger = new Logger('ContactRoleMappingService');

  public async create(data: ContactRoleMappingDto) {
    const phoneNumber = normalizePhoneNumber(data.phoneNumber);

    return this.prismaRepository.contactRoleMapping.upsert({
      where: { phoneNumber },
      create: { phoneNumber, name: data.name, role: data.role, instanceId: data.instanceId },
      update: { name: data.name, role: data.role, instanceId: data.instanceId },
    });
  }

  public async update(contactId: string, data: ContactRoleMappingUpdateDto) {
    await this.findByIdOrThrow(contactId);

    return this.prismaRepository.contactRoleMapping.update({
      where: { id: contactId },
      data: { name: data.name, role: data.role, instanceId: data.instanceId },
    });
  }

  public async delete(contactId: string) {
    await this.findByIdOrThrow(contactId);

    await this.prismaRepository.contactRoleMapping.delete({ where: { id: contactId } });

    return { contactId, deleted: true };
  }

  public async find(query: ContactRoleMappingFindDto) {
    return this.prismaRepository.contactRoleMapping.findMany({
      where: {
        role: query?.role || undefined,
        instanceId: query?.instanceId || undefined,
        phoneNumber: query?.phoneNumber ? normalizePhoneNumber(query.phoneNumber) : undefined,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findByIdOrThrow(contactId: string) {
    const contact = await this.prismaRepository.contactRoleMapping.findUnique({ where: { id: contactId } });

    if (!contact) {
      throw new NotFoundException(`ContactRoleMapping not found: "${contactId}"`);
    }

    return contact;
  }

  public async importCsv(fileBuffer: Buffer): Promise<ContactRoleMappingImportResult> {
    let rows: ContactRoleMappingCsvRow[];

    try {
      rows = parse(fileBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as ContactRoleMappingCsvRow[];
    } catch (error) {
      throw new BadRequestException(`Invalid CSV file: ${getErrorMessage(error)}`);
    }

    const result: ContactRoleMappingImportResult = { imported: 0, updated: 0, skipped: [] };

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2; // +1 for the header row, +1 for 1-based indexing

      try {
        const role = String(row.Papel ?? '').toUpperCase();

        if (!row.Telefone) {
          throw new Error('Missing "Telefone" column');
        }

        if (!CONTACT_ROLES.includes(role)) {
          throw new Error(`Invalid "Papel" value: "${row.Papel}". Expected one of: ${CONTACT_ROLES.join(', ')}`);
        }

        const phoneNumber = normalizePhoneNumber(row.Telefone);
        const existing = await this.prismaRepository.contactRoleMapping.findUnique({ where: { phoneNumber } });

        await this.prismaRepository.contactRoleMapping.upsert({
          where: { phoneNumber },
          create: { phoneNumber, name: row.Nome || null, role, instanceId: row.Instancia || null },
          update: { name: row.Nome || null, role, instanceId: row.Instancia || null },
        });

        existing ? result.updated++ : result.imported++;
      } catch (error) {
        const reason = getErrorMessage(error);
        this.logger.warn(`Skipping CSV row ${rowNumber}: ${reason}`);
        result.skipped.push({ row: rowNumber, reason });
      }
    }

    return result;
  }
}
