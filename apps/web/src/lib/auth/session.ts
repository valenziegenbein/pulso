import { createHmac, timingSafeEqual } from 'node:crypto';
import { SESSION_MAX_AGE } from './constants';

/**
 * Token de sesión propio: payload `userId.expiry` firmado con HMAC-SHA256.
 * Sin dependencias externas. La verificación es a prueba de timing.
 * (SERVER-ONLY: usa node:crypto.)
 */

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error('AUTH_SECRET no está configurado.');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSessionToken(userId: string): string {
  const payload = `${userId}.${Date.now() + SESSION_MAX_AGE * 1000}`;
  const encoded = Buffer.from(payload).toString('base64url');
  return `${encoded}.${sign(payload)}`;
}

export function verifySessionToken(token: string): { userId: string } | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const payload = Buffer.from(encoded, 'base64url').toString('utf8');
  const expected = sign(payload);
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  const [userId, expiry] = payload.split('.');
  if (!userId || !expiry || Date.now() > Number(expiry)) return null;
  return { userId };
}
