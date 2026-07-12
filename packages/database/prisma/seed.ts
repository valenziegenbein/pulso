import { PrismaClient } from '@prisma/client';
import { DEFAULT_ROLE_PERMISSIONS } from '@pulso/domain';
import { PLAN_SEAT_LIMIT, ROLE_KEY, type RoleKey } from '@pulso/shared';
import { hashPassword } from '../src/crypto';
import { assertSeedAllowed } from '../src/seed-safety';

assertSeedAllowed();

const prisma = new PrismaClient();

const ROLE_NAMES: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Super Admin',
  ORG_ADMIN: 'Administrador de organizacion',
  TEAM_ADMIN: 'Administrador de equipo',
  COORDINATOR: 'Coordinador',
  MEMBER: 'Miembro',
  VIEWER: 'Observador',
};

const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: 'pulso-demo' },
    update: { name: 'Pulso Demo', planKey: 'TEAM', seatLimit: PLAN_SEAT_LIMIT.TEAM },
    create: { name: 'Pulso Demo', slug: 'pulso-demo', planKey: 'TEAM', seatLimit: PLAN_SEAT_LIMIT.TEAM },
  });
  await prisma.organizationSubscription.upsert({
    where: { organizationId: org.id },
    update: { planKey: 'TEAM', status: 'ACTIVE', provider: 'MOCK' },
    create: { organizationId: org.id, planKey: 'TEAM', status: 'ACTIVE', provider: 'MOCK' },
  });

  const roleByKey = new Map<RoleKey, string>();
  for (const key of ROLE_KEY) {
    const role = await prisma.role.upsert({
      where: { organizationId_key: { organizationId: org.id, key } },
      update: {
        name: ROLE_NAMES[key],
        permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS[key]),
        isSystem: true,
      },
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

  const maria = await upsertUser('admin@pulso.local', 'María Salazar');
  const ana = await upsertUser('ana@pulso.local', 'Ana Pérez');
  const luis = await upsertUser('luis@pulso.local', 'Luis Romero');
  const carla = await upsertUser('carla@pulso.local', 'Carla Medina');

  await upsertOrgMembership(org.id, maria.id, roleByKey.get('ORG_ADMIN')!, true);
  await upsertOrgMembership(org.id, ana.id, roleByKey.get('MEMBER')!);
  await upsertOrgMembership(org.id, luis.id, roleByKey.get('TEAM_ADMIN')!);
  await upsertOrgMembership(org.id, carla.id, roleByKey.get('MEMBER')!);

  const producto = await upsertTeam(org.id, 'Producto', {
    focus: 'Mejorar experiencia de tickets internos',
    description: 'Diseño de producto, investigación y flujos internos.',
  });
  const operaciones = await upsertTeam(org.id, 'Operaciones', {
    focus: 'Ordenar procesos y próximos pasos',
    description: 'Procesos, coordinación y mejora operativa.',
  });
  const soporte = await upsertTeam(org.id, 'Soporte', {
    focus: 'Base de conocimiento y calidad de atención',
    description: 'Resolución de consultas y documentación de soporte.',
  });

  await upsertTeamMembership(org.id, producto.id, ana.id, roleByKey.get('MEMBER')!);
  await upsertTeamMembership(org.id, operaciones.id, luis.id, roleByKey.get('TEAM_ADMIN')!);
  await upsertTeamMembership(org.id, soporte.id, carla.id, roleByKey.get('MEMBER')!);

  const t1 = await upsertTask(org.id, {
    teamId: producto.id,
    title: 'Mejorar flujo de asignación de tickets',
    description: 'Rediseñar cómo se asignan los tickets internos entre equipos.',
    expectedOutcome: 'Flujo de asignación claro, con responsables y criterios de derivación.',
    definitionOfDone: 'Flujo nuevo documentado y validado con Producto y Soporte.',
    assigneeId: ana.id,
    createdById: maria.id,
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    dueDate: days(3),
  });

  const t2 = await upsertTask(org.id, {
    teamId: operaciones.id,
    title: 'Investigar herramientas de comunicación interna',
    description: 'Comparar opciones para mejorar la comunicación interna y documentar próximos pasos.',
    expectedOutcome: 'Comparativa breve con recomendación para Operaciones.',
    definitionOfDone: 'La recomendación fue revisada por María y se definieron próximos pasos.',
    assigneeId: luis.id,
    createdById: maria.id,
    priority: 'MEDIUM',
    status: 'TODO',
    dueDate: days(7),
  });

  const t3 = await upsertTask(org.id, {
    teamId: soporte.id,
    title: 'Actualizar base de conocimiento',
    description: 'Revisar artículos frecuentes y actualizar contenidos obsoletos.',
    expectedOutcome: 'Base de conocimiento con respuestas claras para consultas repetidas.',
    definitionOfDone: 'Los artículos prioritarios fueron actualizados y revisados por Soporte.',
    assigneeId: carla.id,
    createdById: maria.id,
    priority: 'MEDIUM',
    status: 'IN_PROGRESS',
    dueDate: days(5),
  });

  await upsertBlocker(org.id, producto.id, t1.id, ana.id, {
    title: 'Falta criterio de derivación',
    description: 'Necesitamos definir cuándo un ticket pasa de Producto a Soporte.',
  });

  await upsertDecision(org.id, operaciones.id, t2.id, luis.id, {
    title: 'Elegir herramienta para comunicación interna',
    context: 'Operaciones necesita decidir si prueba una herramienta externa o mejora el flujo actual.',
  });

  await upsertWorklog(org.id, producto.id, t1.id, ana.id, {
    type: 'PROGRESS',
    status: 'PUBLISHED',
    source: 'MANUAL',
    title: 'Avance en el flujo de asignación',
    content: 'Probamos el nuevo flujo con Soporte y detectamos ajustes en criterios de derivación.',
    approvedById: ana.id,
    publishedAt: new Date(),
  });

  await upsertWorklog(org.id, soporte.id, t3.id, carla.id, {
    type: 'PROGRESS',
    status: 'PUBLISHED',
    source: 'MANUAL',
    title: 'Actualización de artículos frecuentes',
    content: 'Actualicé los primeros artículos de la base de conocimiento y marqué dudas para revisar.',
    approvedById: carla.id,
    publishedAt: new Date(),
  });

  await prisma.lLMProviderConfig.upsert({
    where: { id: `${org.id}-mock` },
    update: { providerType: 'MOCK', model: 'mock-1', isActive: true },
    create: { id: `${org.id}-mock`, organizationId: org.id, providerType: 'MOCK', model: 'mock-1', isActive: true },
  });

  console.log('Seed completo: Pulso Demo');
  console.log('  Maria: admin@pulso.local / pulso1234');
  console.log('  Ana: ana@pulso.local / pulso1234');
  console.log('  Luis: luis@pulso.local / pulso1234');
  console.log('  Carla: carla@pulso.local / pulso1234');
}

async function upsertUser(email: string, name: string) {
  return prisma.user.upsert({
    where: { email },
    update: { name },
    create: { email, normalizedEmail: email.toLowerCase(), name, passwordHash: hashPassword('pulso1234'), timezone: 'America/Argentina/Buenos_Aires' },
  });
}

async function upsertOrgMembership(organizationId: string, userId: string, roleId: string, isOwner = false) {
  return prisma.orgMembership.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    update: { roleId, ...(isOwner ? { isOwner: true } : {}) },
    create: { organizationId, userId, roleId, isOwner },
  });
}

async function upsertTeam(organizationId: string, name: string, data: { focus: string; description: string }) {
  const existing = await prisma.team.findFirst({ where: { organizationId, name } });
  if (existing) {
    return prisma.team.update({ where: { id: existing.id }, data });
  }
  return prisma.team.create({ data: { organizationId, name, ...data } });
}

async function upsertTeamMembership(organizationId: string, teamId: string, userId: string, roleId: string) {
  return prisma.teamMembership.upsert({
    where: { teamId_userId: { teamId, userId } },
    update: { roleId },
    create: { organizationId, teamId, userId, roleId },
  });
}

async function upsertTask(
  organizationId: string,
  data: {
    teamId: string;
    title: string;
    description: string;
    expectedOutcome: string;
    definitionOfDone: string;
    assigneeId: string;
    createdById: string;
    priority: string;
    status: string;
    dueDate: Date;
  },
) {
  const existing = await prisma.task.findFirst({ where: { organizationId, title: data.title } });
  if (existing) return prisma.task.update({ where: { id: existing.id }, data });
  return prisma.task.create({ data: { organizationId, ...data } });
}

async function upsertBlocker(
  organizationId: string,
  teamId: string,
  taskId: string,
  createdById: string,
  data: { title: string; description: string },
) {
  const existing = await prisma.blocker.findFirst({ where: { organizationId, taskId, title: data.title } });
  if (existing) return prisma.blocker.update({ where: { id: existing.id }, data: { ...data, status: 'OPEN', resolvedAt: null } });
  return prisma.blocker.create({ data: { organizationId, teamId, taskId, createdById, status: 'OPEN', ...data } });
}

async function upsertDecision(
  organizationId: string,
  teamId: string,
  taskId: string,
  requestedById: string,
  data: { title: string; context: string },
) {
  const existing = await prisma.decisionRequest.findFirst({ where: { organizationId, taskId, title: data.title } });
  if (existing) return prisma.decisionRequest.update({ where: { id: existing.id }, data: { ...data, status: 'OPEN', resolvedAt: null } });
  return prisma.decisionRequest.create({ data: { organizationId, teamId, taskId, requestedById, status: 'OPEN', ...data } });
}

async function upsertWorklog(
  organizationId: string,
  teamId: string,
  taskId: string,
  authorId: string,
  data: {
    type: string;
    status: string;
    source: string;
    title: string;
    content: string;
    approvedById: string;
    publishedAt: Date;
  },
) {
  const existing = await prisma.worklogEntry.findFirst({ where: { organizationId, taskId, title: data.title } });
  if (existing) return prisma.worklogEntry.update({ where: { id: existing.id }, data: { teamId, ...data } });
  return prisma.worklogEntry.create({ data: { organizationId, teamId, taskId, authorId, ...data } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
