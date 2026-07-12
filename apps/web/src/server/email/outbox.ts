import { Prisma, decryptSecret, encryptSecret, prisma } from '@pulso/database';
import type { EmailProvider } from './provider';
import { renderEmail, type EmailTemplate } from './templates';

const MAX_ATTEMPTS = 5;

export async function enqueueEmail(input: {
  idempotencyKey: string; recipient: string; template: EmailTemplate; payload: Record<string, unknown>;
}, client: Pick<Prisma.TransactionClient, 'emailOutbox'> = prisma) {
  if (!input.idempotencyKey.trim() || !input.recipient.includes('@')) throw new Error('Email de outbox inválido.');
  return client.emailOutbox.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      idempotencyKey: input.idempotencyKey,
      recipient: input.recipient.trim().toLowerCase(),
      template: input.template,
      payloadEncrypted: encryptSecret(JSON.stringify(input.payload)),
    },
  });
}

export async function processEmailOutboxBatch(provider: EmailProvider, limit = 10): Promise<{ sent: number; failed: number }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Límite de outbox inválido.');
  const rows = await claimRows(limit);
  let sent = 0; let failed = 0;
  for (const row of rows) {
    try {
      const payload = JSON.parse(decryptSecret(row.payloadEncrypted)) as Record<string, unknown>;
      const email = renderEmail(row.template as EmailTemplate, row.recipient, payload);
      const result = await provider.sendEmail(email);
      await prisma.emailOutbox.update({
        where: { id: row.id }, data: { status: 'SENT', sentAt: new Date(), lockedAt: null, providerMessageId: result.messageId, lastError: null },
      });
      sent += 1;
    } catch (error) {
      const terminal = row.attempts >= MAX_ATTEMPTS;
      await prisma.emailOutbox.update({
        where: { id: row.id },
        data: { status: terminal ? 'DEAD' : 'FAILED', lockedAt: null, nextAttemptAt: new Date(Date.now() + backoffMs(row.attempts)), lastError: sanitize(error) },
      });
      failed += 1;
    }
  }
  return { sent, failed };
}

async function claimRows(limit: number) {
  return prisma.$transaction(async (tx) => {
    const ids = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "EmailOutbox"
      WHERE ("status" = 'PENDING'
        OR ("status" = 'FAILED' AND "nextAttemptAt" <= clock_timestamp())
        OR ("status" = 'PROCESSING' AND "lockedAt" < clock_timestamp() - interval '10 minutes'))
      ORDER BY "createdAt" ASC FOR UPDATE SKIP LOCKED LIMIT ${limit}
    `);
    if (!ids.length) return [];
    await tx.emailOutbox.updateMany({
      where: { id: { in: ids.map((row) => row.id) } },
      data: { status: 'PROCESSING', lockedAt: new Date(), attempts: { increment: 1 } },
    });
    return tx.emailOutbox.findMany({ where: { id: { in: ids.map((row) => row.id) } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

function backoffMs(attempt: number): number { return Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1)); }
function sanitize(error: unknown): string { return (error instanceof Error ? error.message : 'Error de email').replace(/[\r\n\t]/g, ' ').slice(0, 240); }
