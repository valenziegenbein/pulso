'use server';

import { revalidatePath } from 'next/cache';
import { hashPassword, prisma } from '@pulso/database';
import { canCreateRootTeam, canCreateSubteam, canInviteRoleToTeam, PERMISSIONS } from '@pulso/domain';
import { createTeamSchema, invitePersonSchema } from '@pulso/shared';
import { hasPermission, requireAuth } from '@/lib/auth/context';
import {
  assertAllowed,
  countOrgMembers,
  getAuthorizedUser,
  requireTeamInOrg,
} from '@/server/authz';

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s : undefined;
}

export async function createTeamAction(formData: FormData): Promise<void> {
  const ctx = await requireAuth();
  const parentTeamId = str(formData, 'parentTeamId');
  const permission = parentTeamId ? PERMISSIONS.TEAM_CREATE_SUB : PERMISSIONS.TEAM_CREATE;
  if (!hasPermission(ctx, permission)) throw new Error('Sin permiso para crear equipos.');

  const parsed = createTeamSchema.parse({
    name: str(formData, 'name'),
    description: str(formData, 'description'),
    focus: str(formData, 'focus'),
    parentTeamId,
  });
  const actor = await getAuthorizedUser(ctx);
  if (parsed.parentTeamId) {
    const parent = await requireTeamInOrg(ctx, parsed.parentTeamId);
    assertAllowed(canCreateSubteam(actor, parent.id), 'Sin permiso para crear subequipos aca.');
  } else {
    assertAllowed(canCreateRootTeam(actor), 'Solo admins de organizacion pueden crear equipos raiz.');
  }

  await prisma.team.create({
    data: {
      organizationId: ctx.organizationId,
      name: parsed.name,
      description: parsed.description ?? null,
      focus: parsed.focus ?? null,
      parentTeamId: parsed.parentTeamId ?? null,
    },
  });
  revalidatePath('/teams');
  revalidatePath('/');
}

export async function invitePersonAction(formData: FormData): Promise<void> {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.PERSON_INVITE)) throw new Error('Sin permiso para invitar personas.');

  const parsed = invitePersonSchema.parse({
    email: str(formData, 'email'),
    name: str(formData, 'name'),
    roleKey: str(formData, 'roleKey'),
    teamId: str(formData, 'teamId'),
  });

  const role = await prisma.role.findUnique({
    where: { organizationId_key: { organizationId: ctx.organizationId, key: parsed.roleKey } },
  });
  if (!role) throw new Error('Rol no encontrado.');
  const [actor, team] = await Promise.all([
    getAuthorizedUser(ctx),
    parsed.teamId ? requireTeamInOrg(ctx, parsed.teamId) : Promise.resolve(null),
  ]);
  assertAllowed(canInviteRoleToTeam(actor, parsed.roleKey, team?.id), 'Sin permiso para anadir este rol/equipo.');

  const existingUser = await prisma.user.findUnique({ where: { email: parsed.email } });
  const existingMembership = existingUser
    ? await prisma.orgMembership.findUnique({
        where: { organizationId_userId: { organizationId: ctx.organizationId, userId: existingUser.id } },
      })
    : null;
  if (!existingMembership) {
    const [org, usedSeats] = await Promise.all([
      prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { seatLimit: true } }),
      countOrgMembers(ctx.organizationId),
    ]);
    if (org && usedSeats >= org.seatLimit) {
      throw new Error('Tu plan no tiene seats disponibles. Cambia de plan para sumar mas personas.');
    }
  }

  // MVP: la persona invitada recibe una contraseña temporal. En producción se
  // enviaría un email de activación para que defina la suya.
  const user = await prisma.user.upsert({
    where: { email: parsed.email },
    update: { name: parsed.name },
    create: { email: parsed.email, name: parsed.name, passwordHash: hashPassword('pulso1234') },
  });

  await prisma.orgMembership.upsert({
    where: { organizationId_userId: { organizationId: ctx.organizationId, userId: user.id } },
    update: { roleId: role.id },
    create: { organizationId: ctx.organizationId, userId: user.id, roleId: role.id },
  });

  if (team) {
    await prisma.teamMembership.upsert({
      where: { teamId_userId: { teamId: team.id, userId: user.id } },
      update: { roleId: role.id },
      create: { teamId: team.id, userId: user.id, roleId: role.id },
    });
  }

  await prisma.auditEvent.create({
    data: {
      organizationId: ctx.organizationId,
      actorId: ctx.user.id,
      action: 'MEMBER_INVITED',
      entityType: 'User',
      entityId: user.id,
    },
  });

  revalidatePath('/teams');
  revalidatePath('/members');
}
