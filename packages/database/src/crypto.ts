import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Utilidades de seguridad SERVER-ONLY. No importar desde el frontend.
 *
 * - Hash de contraseñas con scrypt (sin dependencias externas).
 * - Cifrado de API keys de proveedores LLM con AES-256-GCM.
 */

// ----------------------------- Passwords -----------------------------

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const derived = scryptSync(plain, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// --------------------------- Secret cipher ---------------------------

function getKey(): Buffer {
  const hex = process.env.WORKLOG_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('WORKLOG_ENCRYPTION_KEY debe ser 32 bytes en hex (64 caracteres).');
  }
  return Buffer.from(hex, 'hex');
}

/** Cifra un secreto (ej: API key). Devuelve "iv:tag:ciphertext" en base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

/** Descifra un secreto producido por `encryptSecret`. */
export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Payload cifrado inválido.');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

export { randomUUID };
