import {
  ContactRoleMappingDto,
  ContactRoleMappingFindDto,
  ContactRoleMappingUpdateDto,
} from '@api/dto/contactRoleMapping.dto';
import { ContactRoleMappingService } from '@api/services/contactRoleMapping.service';
import { BadRequestException } from '@exceptions';

export class ContactRoleMappingController {
  constructor(private readonly contactRoleMappingService: ContactRoleMappingService) {}

  public async create(data: ContactRoleMappingDto) {
    return this.contactRoleMappingService.create(data);
  }

  public async update({ contactId }: { contactId: string }, data: ContactRoleMappingUpdateDto) {
    return this.contactRoleMappingService.update(contactId, data);
  }

  public async delete({ contactId }: { contactId: string }) {
    return this.contactRoleMappingService.delete(contactId);
  }

  public async find(query: ContactRoleMappingFindDto) {
    return this.contactRoleMappingService.find(query);
  }

  public async importCsv(file?: { buffer: Buffer }) {
    if (!file?.buffer) {
      throw new BadRequestException('A CSV file must be sent in the "file" field (multipart/form-data)');
    }

    return this.contactRoleMappingService.importCsv(file.buffer);
  }
}
