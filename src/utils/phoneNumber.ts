import { BadRequestException } from '@exceptions';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function normalizePhoneNumber(rawPhoneNumber: string): string {
  const digitsOnly = String(rawPhoneNumber ?? '').replace(/\D/g, '');
  const parsed = parsePhoneNumberFromString(`+${digitsOnly}`);

  if (!parsed || !parsed.isValid()) {
    throw new BadRequestException(`Invalid phone number: "${rawPhoneNumber}"`);
  }

  return parsed.number.replace('+', '');
}
