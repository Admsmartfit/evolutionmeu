import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const SALT = 'evolution-api-audit-module';

function resolveKey(rawKey: string): Buffer {
  if (!rawKey || rawKey.trim().length === 0) {
    throw new Error('AUDIT_ENCRYPTION_KEY is not configured. Set it before using the audit module encryption utility.');
  }

  return scryptSync(rawKey, SALT, KEY_LENGTH);
}

export function encrypt(plainText: string, rawKey: string): string {
  const key = resolveKey(rawKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

export function decrypt(cipherText: string, rawKey: string): string {
  const key = resolveKey(rawKey);
  const parts = cipherText.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format. Expected "iv:authTag:cipherText".');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]);

  return decrypted.toString('utf8');
}
