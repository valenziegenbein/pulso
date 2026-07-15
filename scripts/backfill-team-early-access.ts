import process from 'node:process';
import { decryptSecret, prisma } from '../packages/database/src/index';
import { normalizeEmail } from '../apps/web/src/lib/auth/session';
import { EARLY_ACCESS_PRODUCT, recordEarlyAccessRequest } from '../apps/web/src/server/early-access';

const ACK = 'backfill-team-contacts';

async function main(): Promise<void> {
  if (!process.argv.includes('--ack') || !process.argv.includes(ACK)) {
    throw new Error(`Falta --ack ${ACK}.`);
  }

  const rows = await prisma.emailOutbox.findMany({
    where: { template: 'CONTACT_REQUEST' },
    select: { payloadEncrypted: true },
    orderBy: { createdAt: 'asc' },
  });

  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    const payload = parsePayload(row.payloadEncrypted);
    if (!payload || (payload.topic !== 'teams' && payload.topic !== 'business')) continue;

    const normalizedEmail = normalizeEmail(payload.senderEmail);
    const existing = await prisma.earlyAccessRequest.findUnique({
      where: {
        normalizedEmail_product: {
          normalizedEmail,
          product: EARLY_ACCESS_PRODUCT.TEAMS,
        },
      },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    await recordEarlyAccessRequest({
      name: payload.name,
      email: normalizedEmail,
      topic: payload.topic,
      message: payload.message,
      source: 'CONTACT_OUTBOX_BACKFILL',
    });
    imported += 1;
  }

  process.stdout.write(`Backfill Teams completo: importadas=${imported}; omitidas_existentes=${skipped}.\n`);
}

function parsePayload(encrypted: string): {
  topic: string;
  name: string;
  senderEmail: string;
  message: string;
} | null {
  const value = JSON.parse(decryptSecret(encrypted)) as Record<string, unknown>;
  if (
    typeof value.topic !== 'string'
    || typeof value.name !== 'string'
    || typeof value.senderEmail !== 'string'
    || typeof value.message !== 'string'
  ) return null;
  return {
    topic: value.topic,
    name: value.name,
    senderEmail: value.senderEmail,
    message: value.message,
  };
}

void main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
