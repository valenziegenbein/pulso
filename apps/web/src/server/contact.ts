import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@pulso/database';
import { enqueueEmail } from './email/outbox';
import { recordEarlyAccessRequest } from './early-access';

const TOPICS = new Set(['teams', 'business', 'personal-ai', 'support', 'press', 'other']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactRequest = {
  topic: string;
  name: string;
  email: string;
  company?: string;
  teamSize?: string;
  message: string;
  consent: boolean;
  website?: string;
};

export function parseContactRequest(value: unknown): ContactRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const topic = text(input.topic, 40);
  const name = text(input.name, 120);
  const email = text(input.email, 254).toLowerCase();
  const message = text(input.message, 4_000, true);
  if (!TOPICS.has(topic) || !name || !EMAIL_PATTERN.test(email) || message.length < 10 || input.consent !== true) return null;
  return {
    topic,
    name,
    email,
    company: optional(input.company, 160),
    teamSize: optional(input.teamSize, 40),
    message,
    consent: true,
    website: optional(input.website, 200),
  };
}

export async function enqueueContactRequest(input: ContactRequest): Promise<void> {
  const recipient = (process.env.PULSO_CONTACT_RECIPIENT ?? process.env.GOOGLE_GMAIL_SENDER)?.trim().toLowerCase();
  if (!recipient || !EMAIL_PATTERN.test(recipient)) throw new Error('Falta PULSO_CONTACT_RECIPIENT.');
  await prisma.$transaction(async (tx) => {
    await enqueueEmail({
      idempotencyKey: `contact:${randomUUID()}`,
      recipient,
      template: 'CONTACT_REQUEST',
      payload: {
        topic: input.topic,
        name: input.name,
        senderEmail: input.email,
        company: input.company,
        teamSize: input.teamSize,
        message: input.message,
      },
    }, tx);
    if (input.topic === 'personal-ai') {
      await recordEarlyAccessRequest({ name: input.name, email: input.email, message: input.message }, tx);
    }
  });
}

export function contactRateLimitKey(input: ContactRequest): string {
  return createHash('sha256').update(input.email).digest('hex');
}

export function isAllowedContactOrigin(origin: string | null, configured: string | undefined, production: boolean): boolean {
  if (!configured?.trim()) return !production && origin === 'http://localhost:3000';
  try {
    return new URL(origin ?? '').origin === new URL(configured).origin;
  } catch {
    return false;
  }
}

function text(value: unknown, max: number, multiline = false): string {
  if (typeof value !== 'string') return '';
  const normalized = multiline ? value.replace(/\r\n?/g, '\n') : value.replace(/[\r\n\t]/g, ' ');
  return normalized.trim().slice(0, max);
}

function optional(value: unknown, max: number): string | undefined {
  const result = text(value, max);
  return result || undefined;
}
