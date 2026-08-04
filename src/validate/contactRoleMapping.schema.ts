import { JSONSchema7 } from 'json-schema';
import { v4 } from 'uuid';

export const CONTACT_ROLES = ['SOCIO', 'GERENTE', 'ADMINISTRATIVO', 'OUTRO'];

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

export const contactRoleMappingSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    phoneNumber: { type: 'string', description: 'Phone number in international format, e.g. "5511999999999"' },
    name: { type: 'string' },
    role: { type: 'string', enum: CONTACT_ROLES },
    instanceId: { type: 'string' },
  },
  required: ['phoneNumber', 'role'],
  ...isNotEmpty('phoneNumber', 'role'),
};

export const contactRoleMappingUpdateSchema: JSONSchema7 = {
  $id: v4(),
  type: 'object',
  properties: {
    name: { type: 'string' },
    role: { type: 'string', enum: CONTACT_ROLES },
    instanceId: { type: 'string' },
  },
};
