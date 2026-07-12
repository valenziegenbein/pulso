import { randomUUID } from 'node:crypto';
import { hashPassword, prisma } from '../packages/database/src/index';
import { issueVerificationToken } from '../apps/web/src/server/auth-service';
import { processEmailOutboxBatch } from '../apps/web/src/server/email/outbox';
import { createRuntimeEmailProvider } from '../apps/web/src/server/email/runtime';

async function main(): Promise<void> {
  assertIsolatedDatabase();
  const recipient = process.env.GOOGLE_GMAIL_SENDER?.trim().toLowerCase();
  if (!recipient || !recipient.includes('@')) throw new Error('GOOGLE_GMAIL_SENDER es obligatorio.');
  const userId = `gmail-smoke-${randomUUID()}`;
  await prisma.user.create({
    data: {
      id: userId,
      email: recipient,
      normalizedEmail: recipient,
      name: 'Pulso Gmail Smoke',
      passwordHash: hashPassword(`synthetic-${randomUUID()}`),
    },
  });
  await issueVerificationToken(userId, recipient);
  const pending = await prisma.emailOutbox.findFirstOrThrow({
    where: { recipient, template: 'VERIFY_EMAIL', status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  const provider = createRuntimeEmailProvider();
  const result = await processEmailOutboxBatch(provider, 1);
  if (result.sent !== 1 || result.failed !== 0) throw new Error('El worker no entregó exactamente un email.');
  const delivered = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: pending.id } });
  if (delivered.status !== 'SENT' || !delivered.providerMessageId || !delivered.sentAt) {
    throw new Error('El outbox no confirmó la entrega de Gmail.');
  }
  console.log('Gmail auth → outbox → worker smoke: OK');
}

function assertIsolatedDatabase(): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (process.env.PULSO_EMAIL_SMOKE_ACK !== 'isolated-self-recipient'
    || !databaseUrl || databaseUrl !== process.env.TEST_DATABASE_URL) {
    throw new Error('Smoke Gmail bloqueado: falta confirmación de DB aislada.');
  }
  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || database !== 'pulso_email_smoke') {
    throw new Error('Smoke Gmail bloqueado: destino PostgreSQL no aislado.');
  }
}

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Falló el smoke Gmail outbox.');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
