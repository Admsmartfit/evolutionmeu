export class ContactRoleMappingDto {
  phoneNumber: string;
  name?: string;
  role: string;
  instanceId?: string;
}

export class ContactRoleMappingUpdateDto {
  name?: string;
  role?: string;
  instanceId?: string;
}

export class ContactRoleMappingFindDto {
  role?: string;
  instanceId?: string;
  phoneNumber?: string;
}

export class EmptyDto {}
