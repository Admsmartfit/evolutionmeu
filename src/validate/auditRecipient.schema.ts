import { JSONSchema7 } from 'json-schema';
import { v4 } from 'uuid';

export const AUDIT_RECIPIENT_TRIGGER_CONDITIONS = ['ALWAYS', 'ONLY_HIGH_CRITICAL'];

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
  phoneNumber: { type: 'string', description: 'Phone number in international format, e.g. "5511999999999"' },
  role: { type: 'string' },
  triggerCondition: { type: 'string', enum: AUDIT_RECIPIENT_TRIGGER_CONDITIONS },
  active: { type: 'boolean' },
};

export const auditRecipientSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: commonProperties,
  required: ['name', 'phoneNumber'],
  ...isNotEmpty('name', 'phoneNumber'),
};

export const auditRecipientUpdateSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: commonProperties,
};
