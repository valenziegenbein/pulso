import { prisma } from '../packages/database/src/index';
import { processEmailOutboxBatch } from '../apps/web/src/server/email/outbox';
import { createRuntimeEmailProvider } from '../apps/web/src/server/email/runtime';

const limit = Number(process.env.PULSO_EMAIL_BATCH_SIZE ?? 20);

async function main(): Promise<void> {
  try {
    const provider = createRuntimeEmailProvider();
    if (!await provider.verifyConnection()) throw new Error('No se pudo verificar el proveedor de email.');
    const result = await processEmailOutboxBatch(provider, limit);
    console.log(JSON.stringify({ event: 'email_outbox_processed', provider: provider.name, ...result }));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Falló el worker de email.');
  process.exitCode = 1;
});
