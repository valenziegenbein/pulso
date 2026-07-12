'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pulso/database';
import { canCreateRootTeam, canCreateSubteam, canInviteRoleToTeam, PERMISSIONS } from '@pulso/domain';
import { createTeamSchema, invitePersonSchema } from '@pulso/shared';
import { hasPermission, requireAuth } from '@/lib/auth/context';
import type { InviteState } from '@/server/action-types';
import { createOrganizationInvite } from '@/server/auth-service';
import {
  assertAllowed,
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

export async function invitePersonAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.PERSON_INVITE)) {
    return { status: 'error', error: 'Sin permiso para invitar personas.' };
  }

  const parsed = invitePersonSchema.safeParse({
    email: str(formData, 'email'),
    roleKey: str(formData, 'roleKey'),
    teamId: str(formData, 'teamId'),
  });
  if (!parsed.success) {
    return {
      status: 'error',
      error: 'Revisá los datos: email y rol son obligatorios.',
    };
  }
  const input = parsed.data;

  try {
    const role = await prisma.role.findUnique({
      where: { organizationId_key: { organizationId: ctx.organizationId, key: input.roleKey } },
    });
    if (!role) return { status: 'error', error: 'Rol no encontrado.' };

    const [actor, team] = await Promise.all([
      getAuthorizedUser(ctx),
      input.teamId ? requireTeamInOrg(ctx, input.teamId) : Promise.resolve(null),
    ]);
    assertAllowed(canInviteRoleToTeam(actor, input.roleKey, team?.id), 'Sin permiso para añadir este rol/equipo.');

    const { inviteId } = await createOrganizationInvite({
      organizationId: ctx.organizationId,
      invitedById: ctx.user.id,
      email: input.email,
      roleId: role.id,
      teamId: team?.id,
    });

    await prisma.auditEvent.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.user.id,
        action: 'MEMBER_INVITED',
        entityType: 'OrganizationInvite',
        entityId: inviteId,
      },
    });

    revalidatePath('/teams');
    revalidatePath('/members');

    return {
      status: 'created',
      email: input.email,
      message: 'Invitación creada (envío mock). La persona ocupará un seat únicamente al aceptarla.',
    };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'No se pudo añadir a la persona.' };
  }
}
