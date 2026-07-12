import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@pulso/database';
import { enqueueEmail, processEmailOutboxBatch } from '@/server/email/outbox';
import { MockEmailProvider } from '@/server/email/provider';

beforeAll(async () => {
  process.env.WORKLOG_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  await prisma.emailOutbox.deleteMany();
});
afterAll(async () => prisma.$disconnect());

describe('PostgreSQL real: email outbox', () => {
  it('cifra payload, deduplica y entrega una sola vez entre workers concurrentes', async () => {
    const input = {
      idempotencyKey: 'email-integration-1', recipient: 'PERSON@integration.invalid', template: 'VERIFY_EMAIL' as const,
      payload: { actionUrl: 'https://pulso.invalid/verify?token=raw-sensitive-token' },
    };
    await enqueueEmail(input); await enqueueEmail(input);
    const stored = await prisma.emailOutbox.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } });
    expect(stored.payloadEncrypted).not.toContain('raw-sensitive-token');
    const providers = [new MockEmailProvider(), new MockEmailProvider()];
    const results = await Promise.all(providers.map((provider) => processEmailOutboxBatch(provider, 1)));
    expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(1);
    expect(providers.flatMap((provider) => provider.deliveries)).toHaveLength(1);
    await expect(prisma.emailOutbox.findUnique({ where: { idempotencyKey: input.idempotencyKey } })).resolves.toMatchObject({ status: 'SENT', attempts: 1 });
  });

  it('registra error sanitizado y programa backoff', async () => {
    await enqueueEmail({
      idempotencyKey: 'email-integration-fail', recipient: 'fail@integration.invalid', template: 'RESET_PASSWORD',
      payload: { actionUrl: 'https://pulso.invalid/reset?token=synthetic' },
    });
    await expect(processEmailOutboxBatch(new MockEmailProvider(true), 1)).resolves.toEqual({ sent: 0, failed: 1 });
    const row = await prisma.emailOutbox.findUniqueOrThrow({ where: { idempotencyKey: 'email-integration-fail' } });
    expect(row).toMatchObject({ status: 'FAILED', attempts: 1 });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(row.lastError).not.toContain('\n');
  });
});
