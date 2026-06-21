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

const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function main() {
  const existing = await prisma.organization.findUnique({ where: { slug: 'pulso-demo' } });
  if (existing) {
    console.log('La organización demo ya existe. Seed omitido. (Reseteá la base para re-sembrar.)');
    return;
  }

  const org = await prisma.organization.create({
    data: { name: 'Pulso Demo', slug: 'pulso-demo' },
  });

  // Roles del sistema (con su matriz de permisos por defecto).
  const roleByKey = new Map<RoleKey, string>();
  for (const key of ROLE_KEY) {
    const role = await prisma.role.create({
      data: {
        organizationId: org.id,
        key,
        name: ROLE_NAMES[key],
        permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS[key]),
        isSystem: true,
      },
    });
    roleByKey.set(key, role.id);
  }

  // Usuario admin de prueba.
  const admin = await prisma.user.create({
    data: {
      email: 'admin@pulso.local',
      name: 'María Salazar',
      passwordHash: hashPassword('pulso1234'),
      timezone: 'America/Argentina/Buenos_Aires',
    },
  });
  await prisma.orgMembership.create({
    data: { organizationId: org.id, userId: admin.id, roleId: roleByKey.get('ORG_ADMIN')! },
  });

  // Algunas personas.
  const people = await Promise.all(
    [
      { email: 'ana@pulso.local', name: 'Ana Pérez' },
      { email: 'luis@pulso.local', name: 'Luis Romero' },
      { email: 'carla@pulso.local', name: 'Carla Medina' },
    ].map((p) =>
      prisma.user.create({
        data: { ...p, passwordHash: hashPassword('pulso1234') },
      }),
    ),
  );
  for (const person of people) {
    await prisma.orgMembership.create({
      data: { organizationId: org.id, userId: person.id, roleId: roleByKey.get('MEMBER')! },
    });
  }
  const [ana, luis] = people;

  // Equipos (uno con sub-equipo).
  const producto = await prisma.team.create({
    data: { organizationId: org.id, name: 'Producto', focus: 'Mejorar experiencia de tickets internos' },
  });
  const operaciones = await prisma.team.create({
    data: { organizationId: org.id, name: 'Operaciones', focus: 'Optimizar procesos de soporte' },
  });
  await prisma.team.create({
    data: {
      organizationId: org.id,
      name: 'Producto · Research',
      focus: 'Investigación de herramientas',
      parentTeamId: producto.id,
    },
  });

  // Tareas variadas (algunas sin DoD, vencidas y bloqueadas para el dashboard admin).
  const t1 = await prisma.task.create({
    data: {
      organizationId: org.id,
      teamId: producto.id,
      title: 'Mejorar flujo de asignación de tickets',
      description: 'Rediseñar cómo se asignan los tickets internos entre equipos.',
      assigneeId: ana!.id,
      createdById: admin.id,
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      dueDate: days(3),
      definitionOfDone: 'Flujo nuevo documentado y validado con 2 equipos.',
    },
  });
  const t2 = await prisma.task.create({
    data: {
      organizationId: org.id,
      teamId: operaciones.id,
      title: 'Mapear proceso de soporte actual',
      assigneeId: luis!.id,
      createdById: admin.id,
      priority: 'URGENT',
      status: 'BLOCKED',
      dueDate: days(-1), // vencida
      // sin definitionOfDone → aparece como riesgo en el dashboard admin
    },
  });
  await prisma.task.create({
    data: {
      organizationId: org.id,
      teamId: producto.id,
      title: 'Investigar herramientas de comunicación (Intercom, Chatwoot)',
      assigneeId: ana!.id,
      createdById: admin.id,
      priority: 'MEDIUM',
      status: 'TODO',
      dueDate: days(5),
      definitionOfDone: 'Comparativa con recomendación.',
    },
  });

  await prisma.blocker.create({
    data: {
      taskId: t2.id,
      description: 'Falta aprobación de presupuesto para nuevas herramientas.',
      createdById: luis!.id,
    },
  });

  // Agenda.
  await prisma.agendaEvent.create({
    data: {
      organizationId: org.id,
      userId: ana!.id,
      type: 'FOCUS_BLOCK',
      title: 'Bloque de foco: rediseño de flujo',
      startsAt: days(0),
      endsAt: days(0),
      taskId: t1.id,
    },
  });

  // Bitácora: una publicada (manual) y un borrador generado por IA (mock).
  await prisma.worklogEntry.create({
    data: {
      organizationId: org.id,
      authorId: ana!.id,
      taskId: t1.id,
      type: 'PROGRESS',
      status: 'PUBLISHED',
      source: 'MANUAL',
      title: 'Avance en el flujo de asignación',
      content: 'Probamos el nuevo flujo con el equipo de Soporte. Feedback positivo.',
      approvedById: ana!.id,
      publishedAt: new Date(),
    },
  });

  const suggestion = await prisma.aIWorklogSuggestion.create({
    data: {
      organizationId: org.id,
      requestedById: ana!.id,
      taskId: t1.id,
      inputNote: 'investigando intercom',
      suggestedType: 'RESEARCH',
      suggestedTitle: 'Evaluación de Intercom',
      suggestedContent:
        'Estoy evaluando Intercom como posible herramienta para centralizar tickets internos. Resultado esperado: decidir entre Intercom, Chatwoot o un sistema propio.',
      providerType: 'MOCK',
      model: 'mock-1',
    },
  });
  await prisma.worklogEntry.create({
    data: {
      organizationId: org.id,
      authorId: ana!.id,
      taskId: t1.id,
      type: 'RESEARCH',
      status: 'DRAFT', // borrador: NO publicado hasta aprobación humana
      source: 'AI_SUGGESTED',
      title: suggestion.suggestedTitle,
      content: suggestion.suggestedContent,
      suggestion: { connect: { id: suggestion.id } },
    },
  });

  // Configuración LLM por defecto: MOCK (sin red ni API key).
  await prisma.lLMProviderConfig.create({
    data: { organizationId: org.id, providerType: 'MOCK', model: 'mock-1', isActive: true },
  });

  console.log('Seed completo:');
  console.log('  Organización: Pulso Demo');
  console.log('  Admin: admin@pulso.local / pulso1234');
  console.log(`  Equipos: 3 · Personas: ${people.length + 1} · Tareas: 3`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
