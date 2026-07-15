import process from 'node:process';
import { prisma } from '../packages/database/src/index';
import { normalizeEmail } from '../apps/web/src/lib/auth/session';
import { bootstrapSuperAdminAccount, recordEarlyAccessRequest } from '../apps/web/src/server/early-access';

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

async function main(): Promise<void> {
  try {
    if (command === 'promote-superadmin') await promoteSuperAdmin(args);
    else if (command === 'import-request') await importRequest(args);
    else throw new Error('Uso: promote-superadmin | import-request.');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

async function promoteSuperAdmin(args: Map<string, string>): Promise<void> {
  const email = requiredEmail(args);
  const ack = args.get('ack');
  const createIfMissing = ack === 'create-superadmin-account';
  if (!createIfMissing && ack !== 'promote-existing-user') {
    throw new Error('Falta --ack promote-existing-user o --ack create-superadmin-account.');
  }
  const result = await bootstrapSuperAdminAccount({
    email,
    name: args.get('name'),
    createIfMissing,
    sendPasswordReset: createIfMissing,
  });
  process.stdout.write(`Superadmin habilitado: ${email}; cuenta creada=${result.created}; reset encolado=${createIfMissing}\n`);
}

async function importRequest(args: Map<string, string>): Promise<void> {
  requireAck(args, 'import-confirmed-request');
  const email = requiredEmail(args);
  const name = required(args, 'name').slice(0, 120);
  const requestedProduct = args.get('product');
  const product = requestedProduct === 'TEAMS'
    ? 'Pulso Teams'
    : requestedProduct === 'PERSONAL_LOCAL'
      ? 'Personal Local / BYOK'
      : 'Personal AI';
  const request = await recordEarlyAccessRequest({
    email,
    name,
    topic: requestedProduct === 'TEAMS' ? 'teams' : 'personal-ai',
    message: `Producto solicitado: ${product}\nSolicitud histórica confirmada e importada por operación interna.`,
  });
  process.stdout.write(`Solicitud disponible en el panel: ${request.normalizedEmail} (${request.product})\n`);
}

function parseArgs(values: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key?.startsWith('--')) throw new Error(`Argumento inválido: ${key ?? ''}`);
    const value = values[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Falta valor para ${key}.`);
    result.set(key.slice(2), value);
    index += 1;
  }
  return result;
}

function requireAck(args: Map<string, string>, expected: string): void {
  if (args.get('ack') !== expected) throw new Error(`Falta --ack ${expected}.`);
}

function requiredEmail(args: Map<string, string>): string {
  const email = normalizeEmail(required(args, 'email'));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email inválido.');
  return email;
}

function required(args: Map<string, string>, key: string): string {
  const value = args.get(key)?.trim();
  if (!value) throw new Error(`Falta --${key}.`);
  return value;
}
