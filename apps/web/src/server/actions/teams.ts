'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { hashPassword, prisma } from '@pulso/database';
import { canCreateRootTeam, canCreateSubteam, canInviteRoleToTeam, PERMISSIONS } from '@pulso/domain';
import { createTeamSchema, invitePersonSchema } from '@pulso/shared';
import { hasPermission, requireAuth } from '@/lib/auth/context';
import type { InviteState } from '@/server/action-types';
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

// Genera una contraseña temporal legible y compartible (sin caracteres
// ambiguos), p. ej. "pulso-7kqm-r4 tp". Suficiente para uso interno; la persona
// puede cambiarla luego.
function generateTempPassword(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'; // sin l, o, 0, 1
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i]! % alphabet.length];
  return `pulso-${out.slice(0, 4)}-${out.slice(4, 8)}`;
}

export async function invitePersonAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.PERSON_INVITE)) {
    return { status: 'error', error: 'Sin permiso para invitar personas.' };
  }

  const parsed = invitePersonSchema.safeParse({
    email: str(formData, 'email'),
    name: str(formData, 'name'),
    roleKey: str(formData, 'roleKey'),
    teamId: str(formData, 'teamId'),
    password: str(formData, 'password'),
  });
  if (!parsed.success) {
    const onPassword = parsed.error.issues.some((i) => i.path[0] === 'password');
    return {
      status: 'error',
      error: onPassword
        ? 'La contraseña debe tener entre 8 y 100 caracteres.'
        : 'Revisá los datos: nombre, email y rol son obligatorios.',
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

    const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
    const existingMembership = existingUser
      ? await prisma.orgMembership.findUnique({
          where: { organizationId_userId: { organizationId: ctx.organizationId, userId: existingUser.id } },
        })
      : null;
    if (!existingMembership) {
      const [org, usedSeats] = await Promise.all([
        prisma.organization.findUnique({ where: { id: ctx.organizationId }, select: { seatLimit: true } }),
        countOrgMembers(ctx),
      ]);
      if (org && usedSeats >= org.seatLimit) {
        return { status: 'error', error: 'Tu plan no tiene seats disponibles. Cambiá de plan para sumar más personas.' };
      }
    }

    // La contraseña solo aplica al CREAR la cuenta. Si el usuario ya existía
    // (en esta u otra org), no se toca su contraseña: solo se ajusta rol/equipo.
    const isNewUser = !existingUser;
    const usedGenerated = isNewUser && !input.password;
    const initialPassword = input.password ?? generateTempPassword();

    const user = await prisma.user.upsert({
      where: { email: input.email },
      update: { name: input.name },
      create: { email: input.email, name: input.name, passwordHash: hashPassword(initialPassword) },
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
        create: { organizationId: ctx.organizationId, teamId: team.id, userId: user.id, roleId: role.id },
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

    if (!isNewUser) {
      return {
        status: 'updated',
        email: input.email,
        message: 'Esa persona ya tenía cuenta. Actualizamos su rol/equipo (su contraseña no cambia).',
      };
    }
    return {
      status: 'created',
      email: input.email,
      message: usedGenerated ? undefined : `Miembro añadido. ${input.name} entra con la contraseña que asignaste.`,
      generatedPassword: usedGenerated ? initialPassword : undefined,
    };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'No se pudo añadir a la persona.' };
  }
}
