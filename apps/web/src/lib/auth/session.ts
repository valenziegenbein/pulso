import { createHmac, timingSafeEqual } from 'node:crypto';
import { SESSION_MAX_AGE } from './constants';

export interface VerifiedSession {
  userId: string;
  activeOrganizationId: string | null;
  expiresAt: number;
  version: 1 | 2;
}

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error('AUTH_SECRET no está configurado.');
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSessionToken(userId: string, activeOrganizationId: string | null): string {
  const payload = JSON.stringify({
    v: 2,
    sub: userId,
    org: activeOrganizationId,
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  });
  const encoded = Buffer.from(payload).toString('base64url');
  return `${encoded}.${sign(payload)}`;
}

export function verifySessionToken(token: string): VerifiedSession | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  if (!encoded || !signature) return null;

  let payload: string;
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const expected = sign(payload);
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  const v2 = parseV2(payload);
  if (v2) return v2;
  return parseLegacy(payload);
}

function parseV2(payload: string): VerifiedSession | null {
  try {
    const parsed = JSON.parse(payload) as { v?: unknown; sub?: unknown; org?: unknown; exp?: unknown };
    if (parsed.v !== 2 || typeof parsed.sub !== 'string' || !parsed.sub) return null;
    if (parsed.org !== null && typeof parsed.org !== 'string') return null;
    if (typeof parsed.exp !== 'number' || !Number.isFinite(parsed.exp) || Date.now() > parsed.exp) return null;
    return {
      userId: parsed.sub,
      activeOrganizationId: parsed.org,
      expiresAt: parsed.exp,
      version: 2,
    };
  } catch {
    return null;
  }
}

/** Compatibilidad transitoria con tokens `userId.expiry`; nunca elige tenant. */
function parseLegacy(payload: string): VerifiedSession | null {
  const [userId, expiry, extra] = payload.split('.');
  const expiresAt = Number(expiry);
  if (!userId || !expiry || extra || !Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  return { userId, activeOrganizationId: null, expiresAt, version: 1 };
}
