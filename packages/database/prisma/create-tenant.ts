/**
 * Provisión del primer tenant (o uno nuevo) en producción.
 *
 * Crea una organización con sus roles de sistema, un usuario ORG_ADMIN (el jefe),
 * un equipo, y opcionalmente un miembro (vos). Idempotente: re-ejecutar actualiza
 * en vez de duplicar. NO siembra datos demo.
 *
 * Uso (vía variables de entorno):
 *   ORG_NAME="Acme"  ORG_SLUG="acme" \
 *   ADMIN_NAME="Jefa Pérez"  ADMIN_EMAIL="jefa@acme.com"  ADMIN_PASSWORD="..." \
 *   MEMBER_NAME="Valentín"   MEMBER_EMAIL="valen@acme.com" MEMBER_PASSWORD="..." \
 *   TEAM_NAME="Dirección" \
 *   DATABASE_URL="postgresql://..." \
 *   pnpm --filter @pulso/database tenant
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_ROLE_PERMISSIONS } from '@pulso/domain';
import { ROLE_KEY, type RoleKey } from '@pulso/shared';
import { hashPassword } from '../src/crypto';

const prisma = new PrismaClient();

const ROLE_NAMES: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Super Admin',
  ORG_ADMIN: 'Administrador de organización',
  TEAM_ADMIN: 'Administrador de equipo',
  COORDINATOR: 'Coordinador',
  MEMBER: 'Miembro',
  VIEWER: 'Observador',
};

function req(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Falta la variable de entorno ${name}.`);
    process.exit(1);
  }
  return v;
}
function opt(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // saca acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

async function main() {
  const orgName = req('ORG_NAME');
  const orgSlug = slugify(opt('ORG_SLUG') ?? orgName);
  const adminName = req('ADMIN_NAME');
  const adminEmail = req('ADMIN_EMAIL').toLowerCase();
  const adminPassword = req('ADMIN_PASSWORD');
  if (adminPassword.length < 8) {
    console.error('ADMIN_PASSWORD debe tener al menos 8 caracteres.');
    process.exit(1);
  }
  const teamName = opt('TEAM_NAME') ?? 'General';
  const memberName = opt('MEMBER_NAME');
  const memberEmail = opt('MEMBER_EMAIL')?.toLowerCase();
  const memberPassword = opt('MEMBER_PASSWORD');

  // 1) Organización
  const org = await prisma.organization.upsert({
    where: { slug: orgSlug },
    update: { name: orgName },
    create: { name: orgName, slug: orgSlug },
  });

  // 2) Roles de sistema
  const roleByKey = new Map<RoleKey, string>();
  for (const key of ROLE_KEY) {
    const role = await prisma.role.upsert({
      where: { organizationId_key: { organizationId: org.id, key } },
      update: { name: ROLE_NAMES[key], permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS[key]), isSystem: true },
      create: {
        organizationId: org.id,
        key,
        name: ROLE_NAMES[key],
        permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS[key]),
        isSystem: true,
      },
    });
    roleByKey.set(key, role.id);
  }

  // 3) Admin (jefe) — ORG_ADMIN. Solo seteamos password al crear (no la pisamos al re-correr).
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { name: adminName },
    create: { email: adminEmail, name: adminName, passwordHash: hashPassword(adminPassword) },
  });
  await prisma.orgMembership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: admin.id } },
    update: { roleId: roleByKey.get('ORG_ADMIN')! },
    create: { organizationId: org.id, userId: admin.id, roleId: roleByKey.get('ORG_ADMIN')! },
  });

  // 4) Equipo + admin como TEAM_ADMIN
  const team =
    (await prisma.team.findFirst({ where: { organizationId: org.id, name: teamName } })) ??
    (await prisma.team.create({ data: { organizationId: org.id, name: teamName } }));
  await prisma.teamMembership.upsert({
    where: { teamId_userId: { teamId: team.id, userId: admin.id } },
    update: { roleId: roleByKey.get('TEAM_ADMIN')! },
    create: { teamId: team.id, userId: admin.id, roleId: roleByKey.get('TEAM_ADMIN')! },
  });

  // 5) Miembro (vos), opcional
  let member: { email: string } | null = null;
  if (memberEmail && memberName && memberPassword) {
    const m = await prisma.user.upsert({
      where: { email: memberEmail },
      update: { name: memberName },
      create: { email: memberEmail, name: memberName, passwordHash: hashPassword(memberPassword) },
    });
    await prisma.orgMembership.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: m.id } },
      update: { roleId: roleByKey.get('MEMBER')! },
      create: { organizationId: org.id, userId: m.id, roleId: roleByKey.get('MEMBER')! },
    });
    await prisma.teamMembership.upsert({
      where: { teamId_userId: { teamId: team.id, userId: m.id } },
      update: { roleId: roleByKey.get('MEMBER')! },
      create: { teamId: team.id, userId: m.id, roleId: roleByKey.get('MEMBER')! },
    });
    member = { email: memberEmail };
  }

  console.log('\n✓ Tenant listo');
  console.log(`  Organización : ${org.name} (${org.slug})`);
  console.log(`  Equipo       : ${team.name}`);
  console.log(`  Admin        : ${adminName} <${adminEmail}>  [ORG_ADMIN]`);
  if (member) console.log(`  Miembro      : ${memberName} <${member.email}>  [MEMBER]`);
  console.log('\nLas contraseñas son las que pasaste por variables de entorno. Cambialas tras el primer login.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
