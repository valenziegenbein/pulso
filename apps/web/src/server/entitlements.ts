import { Prisma, prisma } from '@pulso/database';

export class SeatLimitError extends Error {
  constructor() {
    super('No hay seats disponibles para aceptar la invitación.');
    this.name = 'SeatLimitError';
  }
}

export async function assertSeatAvailable(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
): Promise<void> {
  await lockOrganization(tx, organizationId);
  const existing = await tx.orgMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { id: true },
  });
  if (existing) return;
  const [organization, usedSeats] = await Promise.all([
    tx.organization.findUnique({ where: { id: organizationId }, select: { seatLimit: true } }),
    tx.orgMembership.count({ where: { organizationId, status: { in: ['ACTIVE', 'SUSPENDED'] } } }),
  ]);
  if (!organization || usedSeats >= organization.seatLimit) throw new SeatLimitError();
}

export async function getEntitlements(organizationId: string) {
  const [organization, subscription, usedSeats] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { planKey: true, seatLimit: true } }),
    prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    }),
    prisma.orgMembership.count({ where: { organizationId, status: { in: ['ACTIVE', 'SUSPENDED'] } } }),
  ]);
  return {
    planKey: subscription?.planKey ?? organization.planKey,
    subscriptionStatus: subscription?.status ?? 'LEGACY',
    provider: subscription?.provider ?? 'MOCK',
    seatLimit: organization.seatLimit,
    usedSeats,
    seatsAvailable: Math.max(0, organization.seatLimit - usedSeats),
    managedAiIncludedUnits: subscription?.plan.managedAiIncludedUnits ?? 0,
    allowByok: subscription?.plan.allowByok ?? true,
    allowLocalAi: subscription?.plan.allowLocalAi ?? true,
  };
}

export async function transferOrganizationOwnership(
  organizationId: string,
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const [from, to] = await Promise.all([
      tx.orgMembership.findUnique({ where: { organizationId_userId: { organizationId, userId: fromUserId } } }),
      tx.orgMembership.findUnique({ where: { organizationId_userId: { organizationId, userId: toUserId } } }),
    ]);
    if (!from?.isOwner || to?.status !== 'ACTIVE') throw new Error('Transferencia de ownership inválida.');
    await tx.orgMembership.update({ where: { id: from.id }, data: { isOwner: false } });
    await tx.orgMembership.update({ where: { id: to.id }, data: { isOwner: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function removeOrganizationMember(organizationId: string, targetUserId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const target = await tx.orgMembership.findUnique({
      where: { organizationId_userId: { organizationId, userId: targetUserId } },
    });
    if (!target) return;
    if (target.isOwner) {
      const owners = await tx.orgMembership.count({ where: { organizationId, isOwner: true, status: 'ACTIVE' } });
      if (owners <= 1) throw new Error('No se puede eliminar al último owner de la organización.');
    }
    await tx.orgMembership.delete({ where: { id: target.id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function setMembershipStatus(
  organizationId: string,
  userId: string,
  status: 'ACTIVE' | 'SUSPENDED',
): Promise<void> {
  await prisma.orgMembership.update({
    where: { organizationId_userId: { organizationId, userId } },
    data: { status },
  });
}

export async function recordAIUsage(input: {
  organizationId: string;
  providerType: string;
  model: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  managed: boolean;
  idempotencyKey: string;
}) {
  if (![input.inputTokens, input.outputTokens].every(Number.isSafeInteger)
    || input.inputTokens < 0 || input.outputTokens < 0 || !input.idempotencyKey) {
    throw new Error('Evento de uso IA inválido.');
  }
  return prisma.$transaction(async (tx) => {
    await lockOrganization(tx, input.organizationId);
    const existing = await tx.aIUsageEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    let ledgerEntryId: string | null = null;
    if (input.managed) {
      const subscription = await tx.organizationSubscription.findUnique({
        where: { organizationId: input.organizationId },
        include: { plan: true },
      });
      const limit = subscription?.status === 'ACTIVE' ? subscription.plan.managedAiIncludedUnits : 0;
      const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
      const used = await tx.usageLedger.aggregate({
        where: { organizationId: input.organizationId, kind: 'MANAGED_AI', periodStart },
        _sum: { units: true },
      });
      const units = input.inputTokens + input.outputTokens;
      if (limit <= 0 || (used._sum.units ?? 0) + units > limit) throw new Error('Cuota Managed AI agotada o no configurada.');
      const ledger = await tx.usageLedger.create({
        data: {
          organizationId: input.organizationId,
          kind: 'MANAGED_AI',
          units,
          idempotencyKey: `ai:${input.idempotencyKey}`,
          periodStart,
        },
      });
      ledgerEntryId = ledger.id;
    }
    return tx.aIUsageEvent.create({
      data: { ...input, ledgerEntryId },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function lockOrganization(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`,
  );
  if (rows.length !== 1) throw new Error('Organización no encontrada.');
}
