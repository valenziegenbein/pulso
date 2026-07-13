import process from 'node:process';
import { prisma } from '@pulso/database';
import { normalizeEmail } from '../apps/web/src/lib/auth/session';
import { recordEarlyAccessRequest } from '../apps/web/src/server/early-access';

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

try {
  if (command === 'promote-superadmin') await promoteSuperAdmin(args);
  else if (command === 'import-request') await importRequest(args);
  else throw new Error('Uso: promote-superadmin | import-request.');
} finally {
  await prisma.$disconnect();
}

async function promoteSuperAdmin(args: Map<string, string>): Promise<void> {
  requireAck(args, 'promote-existing-user');
  const email = requiredEmail(args);
  const user = await prisma.user.findUnique({
    where: { normalizedEmail: email },
    include: { _count: { select: { orgMemberships: true } } },
  });
  if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt || user._count.orgMemberships < 1) {
    throw new Error('El superadmin debe ser una cuenta existente, activa, verificada y con membresía.');
  }
  await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: true } });
  process.stdout.write(`Superadmin habilitado: ${email}\n`);
}

async function importRequest(args: Map<string, string>): Promise<void> {
  requireAck(args, 'import-confirmed-request');
  const email = requiredEmail(args);
  const name = required(args, 'name').slice(0, 120);
  const product = args.get('product') === 'PERSONAL_LOCAL' ? 'Personal Local / BYOK' : 'Personal AI';
  const request = await recordEarlyAccessRequest({
    email,
    name,
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
