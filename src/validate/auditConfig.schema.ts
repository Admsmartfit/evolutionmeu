import { JSONSchema7 } from 'json-schema';
import { v4 } from 'uuid';

export const AUDIT_PERIODICITIES = ['WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM'];
export const AUDIT_AI_PROVIDERS = ['GEMINI', 'CLAUDE'];

const isNotEmpty = (...propertyNames: string[]): JSONSchema7 => {
  const properties = {};
  propertyNames.forEach(
    (property) =>
      (properties[property] = {
        minLength: 1,
        description: `The "${property}" cannot be empty`,
      }),
  );
  return {
    if: {
      propertyNames: {
        enum: [...propertyNames],
      },
    },
    then: { properties },
  };
};

const commonProperties: JSONSchema7['properties'] = {
  name: { type: 'string' },
  enabled: { type: 'boolean' },
  periodicity: { type: 'string', enum: AUDIT_PERIODICITIES },
  customStartDate: { type: 'string', format: 'date-time' },
  customEndDate: { type: 'string', format: 'date-time' },
  cronExpression: { type: 'string' },
  selectedInstances: { type: 'array', items: { type: 'string' } },
  excludedJids: { type: 'array', items: { type: 'string' } },
  aiProvider: { type: 'string', enum: AUDIT_AI_PROVIDERS },
  aiModel: { type: 'string' },
  apiKey: { type: 'string' },
  temperature: { type: 'number', minimum: 0, maximum: 2 },
  topP: { type: 'number', minimum: 0, maximum: 1 },
  maxTokens: { type: 'integer', minimum: 1 },
};

export const auditConfigSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: commonProperties,
  required: ['periodicity', 'aiProvider', 'aiModel'],
  ...isNotEmpty('periodicity', 'aiProvider', 'aiModel'),
};

export const auditConfigUpdateSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: commonProperties,
};
