import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decryptSecret, hashPassword, prisma } from '@pulso/database';
import {
  approveEarlyAccessRequest,
  claimEarlyAccessRequest,
  EARLY_ACCESS_STATUS,
  hasApprovedPersonalAiAccess,
  recordEarlyAccessRequest,
  rejectEarlyAccessRequest,
  revokeEarlyAccessRequest,
} from '@/server/early-access';
import { enqueueContactRequest } from '@/server/contact';

const ids = {
  superAdmin: 'early-access-superadmin',
  regularAdmin: 'early-access-regular-admin',
} as const;

beforeAll(async () => {
  process.env.WORKLOG_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.PULSO_APP_URL = 'https://pulso.integration.invalid';
  process.env.PULSO_CONTACT_RECIPIENT = 'owner@integration.invalid';
  await prisma.user.createMany({
    data: [
      {
        id: ids.superAdmin,
        email: 'early-superadmin@integration.invalid',
        normalizedEmail: 'early-superadmin@integration.invalid',
        name: 'Super Admin',
        passwordHash: hashPassword('integration-password'),
        emailVerifiedAt: new Date(),
        isSuperAdmin: true,
      },
      {
        id: ids.regularAdmin,
        email: 'early-regular@integration.invalid',
        normalizedEmail: 'early-regular@integration.invalid',
        name: 'Regular Admin',
        passwordHash: hashPassword('integration-password'),
        emailVerifiedAt: new Date(),
      },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PostgreSQL real: panel de acceso anticipado Personal', () => {
  it('registra, responde, aprueba, da de alta y revoca sin editar variables de entorno', async () => {
    await enqueueContactRequest({
      topic: 'personal-ai',
      name: 'Primer Cliente',
      email: 'first-real-client@integration.invalid',
      message: 'Producto solicitado: Personal AI\nSistema operativo: Windows 11',
      consent: true,
    });
    const request = await prisma.earlyAccessRequest.findUniqueOrThrow({
      where: { normalizedEmail_product: { normalizedEmail: 'first-real-client@integration.invalid', product: 'PERSONAL_AI' } },
    });
    expect(request.status).toBe(EARLY_ACCESS_STATUS.PENDING);
    await expect(hasApprovedPersonalAiAccess(request.normalizedEmail)).resolves.toBe(false);

    const received = await prisma.emailOutbox.findFirstOrThrow({
      where: { recipient: request.normalizedEmail, template: 'EARLY_ACCESS_RECEIVED' },
    });
    expect(JSON.parse(decryptSecret(received.payloadEncrypted))).toMatchObject({ name: 'Primer Cliente' });
    await expect(approveEarlyAccessRequest(request.id, ids.regularAdmin)).rejects.toThrow('Recurso no disponible');

    await approveEarlyAccessRequest(request.id, ids.superAdmin, 'Primera cohorte');
    await expect(hasApprovedPersonalAiAccess(request.normalizedEmail)).resolves.toBe(true);
    const approvedEmail = await prisma.emailOutbox.findFirstOrThrow({
      where: { recipient: request.normalizedEmail, template: 'EARLY_ACCESS_APPROVED' },
      orderBy: { createdAt: 'desc' },
    });
    const approvedPayload = JSON.parse(decryptSecret(approvedEmail.payloadEncrypted)) as { actionUrl: string };
    const token = new URL(approvedPayload.actionUrl).searchParams.get('token');
    expect(token).toBeTruthy();

    await expect(claimEarlyAccessRequest(token!, 'Primer Cliente', 'short')).resolves.toBeNull();
    const claimed = await claimEarlyAccessRequest(token!, 'Primer Cliente', 'a-secure-integration-password');
    expect(claimed).toMatchObject({ email: request.normalizedEmail });
    const membership = await prisma.orgMembership.findFirstOrThrow({ where: { userId: claimed!.userId } });
    expect(membership).toMatchObject({ isOwner: true, status: 'ACTIVE' });
    await expect(claimEarlyAccessRequest(token!, 'Primer Cliente', 'another-secure-password')).resolves.toBeNull();

    await revokeEarlyAccessRequest(request.id, ids.superAdmin, 'Fin de la prueba');
    await expect(hasApprovedPersonalAiAccess(request.normalizedEmail)).resolves.toBe(false);
    await expect(prisma.earlyAccessEvent.count({ where: { requestId: request.id } })).resolves.toBe(4);
    await expect(prisma.emailOutbox.count({ where: { recipient: request.normalizedEmail } })).resolves.toBe(3);
  });

  it('rechaza una solicitud pendiente y conserva el historial', async () => {
    const request = await recordEarlyAccessRequest({
      name: 'Solicitud Rechazada',
      email: 'rejected-client@integration.invalid',
      message: 'Producto solicitado: Personal Local / BYOK',
    });
    await rejectEarlyAccessRequest(request.id, ids.superAdmin, 'Fuera de la cohorte actual');
    const stored = await prisma.earlyAccessRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(stored).toMatchObject({ status: EARLY_ACCESS_STATUS.REJECTED, decisionById: ids.superAdmin });
    await expect(prisma.earlyAccessEvent.count({ where: { requestId: request.id } })).resolves.toBe(2);
  });
});
