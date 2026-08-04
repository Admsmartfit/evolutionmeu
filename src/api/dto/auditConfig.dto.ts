export class AuditConfigDto {
  name?: string;
  enabled?: boolean;
  periodicity: string;
  customStartDate?: string;
  customEndDate?: string;
  cronExpression?: string;
  selectedInstances?: string[];
  excludedJids?: string[];
  aiProvider: string;
  aiModel: string;
  apiKey?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export class AuditConfigUpdateDto {
  name?: string;
  enabled?: boolean;
  periodicity?: string;
  customStartDate?: string;
  customEndDate?: string;
  cronExpression?: string;
  selectedInstances?: string[];
  excludedJids?: string[];
  aiProvider?: string;
  aiModel?: string;
  apiKey?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export class AuditConfigFindDto {
  enabled?: string;
}

export class AuditConfigRunDto {
  periodStart?: string;
  periodEnd?: string;
}
