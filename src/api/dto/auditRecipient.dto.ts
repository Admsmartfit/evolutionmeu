export class AuditRecipientDto {
  name: string;
  phoneNumber: string;
  role?: string;
  triggerCondition?: string;
  active?: boolean;
}

export class AuditRecipientUpdateDto {
  name?: string;
  phoneNumber?: string;
  role?: string;
  triggerCondition?: string;
  active?: boolean;
}

export class AuditRecipientFindDto {
  active?: string;
}
