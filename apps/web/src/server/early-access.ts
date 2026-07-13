import { Prisma, hashPassword, prisma } from '@pulso/database';
import { DEFAULT_ROLE_PERMISSIONS } from '@pulso/domain';
import { PLAN_SEAT_LIMIT, ROLE_KEY, type RoleKey } from '@pulso/shared';
import { createOpaqueToken, hashOpaqueToken, normalizeEmail } from '@/lib/auth/session';
import { enqueueEmail } from '@/server/email/outbox';

export const EARLY_ACCESS_PRODUCT = {
  PERSONAL_AI: 'PERSONAL_AI',
  PERSONAL_LOCAL: 'PERSONAL_LOCAL',
} as const;

export const EARLY_ACCESS_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REVOKED: 'REVOKED',
} as const;

const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ROLE_NAMES: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Super Admin', ORG_ADMIN: 'Administrador de organización', TEAM_ADMIN: 'Administrador de equipo',
  COORDINATOR: 'Coordinador', MEMBER: 'Miembro', VIEWER: 'Observador',
};

type EarlyAccessProduct = typeof EARLY_ACCESS_PRODUCT[keyof typeof EARLY_ACCESS_PRODUCT];
type EarlyAccessClient = Pick<Prisma.TransactionClient, 'earlyAccessRequest' | 'earlyAccessEvent' | 'emailOutbox'>;

export interface EarlyAccessContactInput {
  name: string;
  email: string;
  message: string;
}

export function productFromContactMessage(message: string): EarlyAccessProduct {
  return /Personal Local\s*\/\s*BYOK/i.test(message)
    ? EARLY_ACCESS_PRODUCT.PERSONAL_LOCAL
    : EARLY_ACCESS_PRODUCT.PERSONAL_AI;
}

export async function recordEarlyAccessRequest(
  input: EarlyAccessContactInput,
  client: EarlyAccessClient = prisma,
) {
  const normalizedEmail = normalizeEmail(input.email);
  const product = productFromContactMessage(input.message);
  const now = new Date();
  let request = await client.earlyAccessRequest.upsert({
    where: { normalizedEmail_product: { normalizedEmail, product } },
    update: {
      name: input.name.trim().slice(0, 120),
      message: input.message.trim().slice(0, 4_000),
      requestCount: { increment: 1 },
      lastRequestedAt: now,
    },
    create: {
      normalizedEmail,
      name: input.name.trim().slice(0, 120),
      product,
      message: input.message.trim().slice(0, 4_000),
      consentAt: now,
      lastRequestedAt: now,
    },
  });
  if (request.status !== EARLY_ACCESS_STATUS.PENDING && request.status !== EARLY_ACCESS_STATUS.APPROVED) {
    request = await client.earlyAccessRequest.update({
      where: { id: request.id },
      data: {
        status: EARLY_ACCESS_STATUS.PENDING,
        decisionAt: null,
        decisionById: null,
        decisionNote: null,
      },
    });
  }
  const event = await client.earlyAccessEvent.create({
    data: { requestId: request.id, type: 'REQUESTED', metadata: JSON.stringify({ source: 'MARKETING_CONTACT' }) },
  });
  await enqueueEmail({
    idempotencyKey: `early-access:received:${event.id}`,
    recipient: normalizedEmail,
    template: 'EARLY_ACCESS_RECEIVED',
    payload: { name: request.name, product: productLabel(product) },
  }, client);
  return request;
}

export async function listEarlyAccessRequests() {
  return prisma.earlyAccessRequest.findMany({
    include: {
      user: { select: { id: true, status: true, emailVerifiedAt: true } },
      personalOrganization: { select: { id: true, name: true } },
      decisionBy: { select: { id: true, name: true, normalizedEmail: true } },
      events: {
        include: { actor: { select: { name: true, normalizedEmail: true } } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      },
    },
    orderBy: [{ status: 'asc' }, { lastRequestedAt: 'desc' }],
  });
}

export async function hasApprovedPersonalAiAccess(email: string): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;
  const request = await prisma.earlyAccessRequest.findUnique({
    where: { normalizedEmail_product: { normalizedEmail, product: EARLY_ACCESS_PRODUCT.PERSONAL_AI } },
    select: { status: true },
  });
  return request?.status === EARLY_ACCESS_STATUS.APPROVED;
}

export async function approveEarlyAccessRequest(requestId: string, actorId: string, decisionNote?: string) {
  const token = createOpaqueToken();
  return prisma.$transaction(async (tx) => {
    await assertSuperAdmin(tx, actorId);
    const request = await tx.earlyAccessRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new Error('Solicitud no disponible.');

    const user = await tx.user.findUnique({ where: { normalizedEmail: request.normalizedEmail } });
    let organizationId = request.personalOrganizationId;
    if (user && user.status !== 'ACTIVE') throw new Error('La cuenta existente no está activa.');
    if (user && !user.emailVerifiedAt) throw new Error('La cuenta existente todavía no verificó su email.');
    if (user && !await tx.orgMembership.findFirst({ where: { userId: user.id, status: 'ACTIVE' }, select: { id: true } })) {
      organizationId = await createPersonalWorkspace(tx, request.id, request.name, user.id);
    }

    const actionUrl = user
      ? appUrl('/login')
      : appUrl(`/early-access/claim?token=${encodeURIComponent(token)}`);
    const updated = await tx.earlyAccessRequest.update({
      where: { id: request.id },
      data: {
        status: EARLY_ACCESS_STATUS.APPROVED,
        decisionAt: new Date(),
        decisionById: actorId,
        decisionNote: cleanNote(decisionNote),
        userId: user?.id ?? null,
        personalOrganizationId: organizationId,
        claimTokenHash: user ? null : hashOpaqueToken(token),
        claimExpiresAt: user ? null : new Date(Date.now() + CLAIM_TTL_MS),
      },
    });
    const event = await tx.earlyAccessEvent.create({
      data: { requestId: request.id, actorId, type: user ? 'APPROVED_EXISTING_USER' : 'APPROVED_CLAIM_REQUIRED' },
    });
    await enqueueEmail({
      idempotencyKey: `early-access:approved:${event.id}`,
      recipient: request.normalizedEmail,
      template: 'EARLY_ACCESS_APPROVED',
      payload: { name: request.name, product: productLabel(request.product), actionUrl },
    }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function rejectEarlyAccessRequest(requestId: string, actorId: string, decisionNote?: string) {
  return decideWithoutAccess(requestId, actorId, EARLY_ACCESS_STATUS.REJECTED, 'REJECTED', 'EARLY_ACCESS_REJECTED', decisionNote);
}

export async function revokeEarlyAccessRequest(requestId: string, actorId: string, decisionNote?: string) {
  return decideWithoutAccess(requestId, actorId, EARLY_ACCESS_STATUS.REVOKED, 'REVOKED', 'EARLY_ACCESS_REVOKED', decisionNote);
}

export async function claimEarlyAccessRequest(token: string, name: string, password: string) {
  const cleanName = name.trim();
  if (!token || cleanName.length < 2 || cleanName.length > 120 || password.length < 12 || password.length > 256) return null;
  return prisma.$transaction(async (tx) => {
    const request = await tx.earlyAccessRequest.findUnique({ where: { claimTokenHash: hashOpaqueToken(token) } });
    if (!request || request.status !== EARLY_ACCESS_STATUS.APPROVED || request.claimedAt || !request.claimExpiresAt || request.claimExpiresAt.getTime() <= Date.now()) return null;
    if (await tx.user.findUnique({ where: { normalizedEmail: request.normalizedEmail }, select: { id: true } })) return null;
    const user = await tx.user.create({
      data: {
        email: request.normalizedEmail,
        normalizedEmail: request.normalizedEmail,
        name: cleanName,
        passwordHash: hashPassword(password),
        emailVerifiedAt: new Date(),
      },
    });
    const organizationId = await createPersonalWorkspace(tx, request.id, cleanName, user.id);
    await tx.earlyAccessRequest.update({
      where: { id: request.id },
      data: {
        userId: user.id,
        personalOrganizationId: organizationId,
        claimedAt: new Date(),
        claimTokenHash: null,
        claimExpiresAt: null,
      },
    });
    await tx.earlyAccessEvent.create({ data: { requestId: request.id, actorId: user.id, type: 'CLAIMED' } });
    return { userId: user.id, email: user.normalizedEmail, organizationId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function decideWithoutAccess(
  requestId: string,
  actorId: string,
  status: typeof EARLY_ACCESS_STATUS.REJECTED | typeof EARLY_ACCESS_STATUS.REVOKED,
  eventType: string,
  template: 'EARLY_ACCESS_REJECTED' | 'EARLY_ACCESS_REVOKED',
  decisionNote?: string,
) {
  return prisma.$transaction(async (tx) => {
    await assertSuperAdmin(tx, actorId);
    const request = await tx.earlyAccessRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new Error('Solicitud no disponible.');
    if (status === EARLY_ACCESS_STATUS.REJECTED && request.status !== EARLY_ACCESS_STATUS.PENDING) {
      throw new Error('Sólo se pueden rechazar solicitudes pendientes.');
    }
    if (status === EARLY_ACCESS_STATUS.REVOKED && request.status !== EARLY_ACCESS_STATUS.APPROVED) {
      throw new Error('Sólo se pueden revocar accesos aprobados.');
    }
    const updated = await tx.earlyAccessRequest.update({
      where: { id: request.id },
      data: {
        status,
        decisionAt: new Date(),
        decisionById: actorId,
        decisionNote: cleanNote(decisionNote),
        claimTokenHash: null,
        claimExpiresAt: null,
      },
    });
    const event = await tx.earlyAccessEvent.create({ data: { requestId: request.id, actorId, type: eventType } });
    await enqueueEmail({
      idempotencyKey: `early-access:${eventType.toLowerCase()}:${event.id}`,
      recipient: request.normalizedEmail,
      template,
      payload: { name: request.name, product: productLabel(request.product) },
    }, tx);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function assertSuperAdmin(tx: Prisma.TransactionClient, actorId: string): Promise<void> {
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { isSuperAdmin: true, status: true } });
  if (!actor?.isSuperAdmin || actor.status !== 'ACTIVE') throw new Error('Recurso no disponible.');
}

async function createPersonalWorkspace(
  tx: Prisma.TransactionClient,
  requestId: string,
  name: string,
  userId: string,
): Promise<string> {
  const organization = await tx.organization.create({
    data: {
      name: `Pulso Personal · ${name.trim().slice(0, 80)}`,
      slug: `personal-${requestId}`,
      planKey: 'FREE',
      seatLimit: Math.min(1, PLAN_SEAT_LIMIT.FREE),
      roles: {
        create: ROLE_KEY.map((key) => ({
          key,
          name: ROLE_NAMES[key],
          permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS[key]),
          isSystem: true,
        })),
      },
    },
    include: { roles: { select: { id: true, key: true } } },
  });
  const ownerRole = organization.roles.find((role) => role.key === 'ORG_ADMIN');
  if (!ownerRole) throw new Error('No se pudo crear el rol propietario.');
  await tx.orgMembership.create({
    data: { organizationId: organization.id, userId, roleId: ownerRole.id, status: 'ACTIVE', isOwner: true },
  });
  return organization.id;
}

function appUrl(path: string): string {
  const base = process.env.PULSO_APP_URL?.trim();
  if (!base) throw new Error('Falta PULSO_APP_URL para enviar el alta.');
  const url = new URL(path, base);
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('PULSO_APP_URL debe usar HTTPS.');
  return url.toString();
}

function productLabel(product: string): string {
  return product === EARLY_ACCESS_PRODUCT.PERSONAL_LOCAL ? 'Pulso Personal Local / BYOK' : 'Pulso Personal AI';
}

function cleanNote(value?: string): string | null {
  const note = value?.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 500);
  return note || null;
}
