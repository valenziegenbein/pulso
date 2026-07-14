/**
 * Dataset reproducible para capturas de Pulso Teams.
 *
 * Sólo crea/actualiza el tenant fijo `pulso-producto-demo`. Nunca toca otros
 * tenants y aborta si no recibe un opt-in explícito. Las identidades usan el
 * TLD reservado `.invalid`, por lo que no pueden enviar correo a personas.
 *
 * Ejecución:
 *   PULSO_DEMO_SEED_APPROVED=yes \
 *   PULSO_DEMO_ADMIN_PASSWORD='...' \
 *   pnpm teams:demo:seed
 */
import { randomBytes } from 'node:crypto';
import { prisma, encryptSecret, hashPassword } from '../packages/database/src/index';
import { DEFAULT_ROLE_PERMISSIONS } from '../packages/domain/src/index';
import { ROLE_KEY, type RoleKey } from '../packages/shared/src/index';

const DEMO_SLUG = 'pulso-producto-demo';
const DEMO_ORG_ID = 'demo_org_pulso_producto';

if (process.env.PULSO_DEMO_SEED_APPROVED !== 'yes') {
  throw new Error('Demo bloqueada: requiere PULSO_DEMO_SEED_APPROVED=yes.');
}
const adminPassword = process.env.PULSO_DEMO_ADMIN_PASSWORD ?? '';
if (adminPassword.length < 16) throw new Error('La contraseña demo debe tener al menos 16 caracteres.');
const geminiKey = process.env.PULSO_PERSONAL_ACCOUNT_AI_GEMINI_API_KEY?.trim();
if (!geminiKey) throw new Error('Falta la API key administrada de Gemini para generar el pulso con IA.');

const roleNames: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Super Admin',
  ORG_ADMIN: 'Administrador de organización',
  TEAM_ADMIN: 'Administrador de equipo',
  COORDINATOR: 'Coordinador',
  MEMBER: 'Miembro',
  VIEWER: 'Observador',
};

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);
const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: DEMO_SLUG },
    update: { name: 'Pulso Producto', planKey: 'TEAM', seatLimit: 15 },
    create: { id: DEMO_ORG_ID, slug: DEMO_SLUG, name: 'Pulso Producto', planKey: 'TEAM', seatLimit: 15 },
  });
  await prisma.organizationSubscription.upsert({
    where: { organizationId: organization.id },
    update: { planKey: 'TEAM', status: 'ACTIVE', provider: 'MOCK' },
    create: { organizationId: organization.id, planKey: 'TEAM', status: 'ACTIVE', provider: 'MOCK' },
  });

  const roles = new Map<RoleKey, string>();
  for (const key of ROLE_KEY) {
    const role = await prisma.role.upsert({
      where: { organizationId_key: { organizationId: organization.id, key } },
      update: { name: roleNames[key], permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS[key]), isSystem: true },
      create: {
        id: `demo_role_${key.toLowerCase()}`,
        organizationId: organization.id,
        key,
        name: roleNames[key],
        permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS[key]),
        isSystem: true,
      },
    });
    roles.set(key, role.id);
  }

  const people = [
    { key: 'admin', name: 'Valen', email: 'valen.demo@pulso-demo.invalid', role: 'ORG_ADMIN' as RoleKey },
    { key: 'alma', name: 'Alma Torres', email: 'alma@pulso-demo.invalid', role: 'COORDINATOR' as RoleKey },
    { key: 'nico', name: 'Nico Ferrer', email: 'nico@pulso-demo.invalid', role: 'TEAM_ADMIN' as RoleKey },
    { key: 'mora', name: 'Mora Vidal', email: 'mora@pulso-demo.invalid', role: 'MEMBER' as RoleKey },
    { key: 'julian', name: 'Julián Paz', email: 'julian@pulso-demo.invalid', role: 'MEMBER' as RoleKey },
  ];
  const users = new Map<string, { id: string; name: string }>();
  for (const person of people) {
    const passwordHash = hashPassword(person.key === 'admin' ? adminPassword : randomBytes(48).toString('base64url'));
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: {
        name: person.name,
        normalizedEmail: person.email,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        ...(person.key === 'admin' ? { passwordHash, securityVersion: { increment: 1 } } : {}),
      },
      create: {
        email: person.email,
        normalizedEmail: person.email,
        name: person.name,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });
    await prisma.orgMembership.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      update: { roleId: roles.get(person.role)!, status: 'ACTIVE', isOwner: person.key === 'admin' },
      create: {
        organizationId: organization.id,
        userId: user.id,
        roleId: roles.get(person.role)!,
        status: 'ACTIVE',
        isOwner: person.key === 'admin',
      },
    });
    users.set(person.key, { id: user.id, name: user.name });
  }

  const teamSpecs = [
    { key: 'product', name: 'Producto & Experiencia', focus: 'Onboarding, whitelist y claridad del producto' },
    { key: 'platform', name: 'Plataforma & Seguridad', focus: 'Multi-tenant, migraciones y despliegues recuperables' },
    { key: 'desktop', name: 'Desktop & Personal', focus: 'Captura sin fricción y conocimiento local-first' },
    { key: 'growth', name: 'Lanzamiento & Growth', focus: 'Demo real, acceso temprano y narrativa de marketing' },
  ];
  const teams = new Map<string, { id: string; name: string }>();
  for (const spec of teamSpecs) {
    const team = await prisma.team.upsert({
      where: { id: `demo_team_${spec.key}` },
      update: { organizationId: organization.id, name: spec.name, focus: spec.focus },
      create: { id: `demo_team_${spec.key}`, organizationId: organization.id, name: spec.name, focus: spec.focus },
    });
    teams.set(spec.key, team);
  }

  const teamPeople: Record<string, Array<{ user: string; role: RoleKey }>> = {
    product: [{ user: 'admin', role: 'TEAM_ADMIN' }, { user: 'alma', role: 'TEAM_ADMIN' }, { user: 'julian', role: 'MEMBER' }],
    platform: [{ user: 'admin', role: 'TEAM_ADMIN' }, { user: 'nico', role: 'TEAM_ADMIN' }, { user: 'mora', role: 'MEMBER' }],
    desktop: [{ user: 'admin', role: 'TEAM_ADMIN' }, { user: 'mora', role: 'TEAM_ADMIN' }, { user: 'alma', role: 'COORDINATOR' }],
    growth: [{ user: 'admin', role: 'TEAM_ADMIN' }, { user: 'julian', role: 'COORDINATOR' }, { user: 'alma', role: 'MEMBER' }],
  };
  for (const [teamKey, memberships] of Object.entries(teamPeople)) {
    for (const membership of memberships) {
      await prisma.teamMembership.upsert({
        where: { teamId_userId: { teamId: teams.get(teamKey)!.id, userId: users.get(membership.user)!.id } },
        update: { organizationId: organization.id, roleId: roles.get(membership.role)! },
        create: {
          organizationId: organization.id,
          teamId: teams.get(teamKey)!.id,
          userId: users.get(membership.user)!.id,
          roleId: roles.get(membership.role)!,
        },
      });
    }
  }

  const taskSpecs = [
    { key: 'whitelist', team: 'product', title: 'Cerrar whitelist de Personal', assignee: 'alma', status: 'IN_PROGRESS', priority: 'HIGH', due: 2, done: 'Primer usuario externo entra, configura su IA y publica un avance.' },
    { key: 'onboarding', team: 'product', title: 'Pulir onboarding con IA administrada', assignee: 'alma', status: 'IN_REVIEW', priority: 'HIGH', due: 3, done: 'Las opciones Pulso, BYOK, local y sin IA se entienden sin ayuda.' },
    { key: 'migration', team: 'platform', title: 'Validar migración de knowledge sync', assignee: 'nico', status: 'DONE', priority: 'HIGH', due: -1, done: 'Restore aislado, migración y smoke terminan verdes.' },
    { key: 'monitor', team: 'platform', title: 'Monitorear despliegue por digest', assignee: 'nico', status: 'DONE', priority: 'MEDIUM', due: 0, done: 'App y worker quedan healthy, sin reinicios ni drift.' },
    { key: 'offsite', team: 'platform', title: 'Definir backup offsite definitivo', assignee: 'nico', status: 'TODO', priority: 'MEDIUM', due: 7, done: 'Proveedor, retención y restore trimestral documentados.' },
    { key: 'desktop', team: 'desktop', title: 'Recuperar selector, widget e importador Markdown', assignee: 'mora', status: 'DONE', priority: 'HIGH', due: -1, done: 'Desktop conserva estilos y los tres flujos pasan smoke.' },
    { key: 'signing', team: 'desktop', title: 'Firmar release Desktop 0.1.28', assignee: 'mora', status: 'BLOCKED', priority: 'HIGH', due: 4, done: 'Instalador firmado y actualización validada en Windows limpio.' },
    { key: 'resync', team: 'desktop', title: 'Automatizar resincronización de carpetas', assignee: 'mora', status: 'BACKLOG', priority: 'LOW', due: 14, done: 'Los cambios locales se detectan sin subir archivos no consentidos.' },
    { key: 'context', team: 'desktop', title: 'Probar contexto compartido con tres trabajadores', assignee: 'alma', status: 'IN_PROGRESS', priority: 'HIGH', due: 5, done: 'La IA propone entradas usando sólo documentación autorizada del equipo.' },
    { key: 'demo', team: 'growth', title: 'Preparar demo real de Pulso Teams', assignee: 'julian', status: 'IN_PROGRESS', priority: 'HIGH', due: 2, done: 'Captura de administrador y recorrido de 90 segundos listos.' },
    { key: 'video', team: 'growth', title: 'Grabar importación desde Obsidian', assignee: 'julian', status: 'TODO', priority: 'MEDIUM', due: 6, done: 'Video breve muestra importar, indexar y mantener la carpeta local.' },
    { key: 'entitlement', team: 'product', title: 'Separar entitlement de IA Teams y Personal', assignee: 'alma', status: 'TODO', priority: 'MEDIUM', due: 8, done: 'Cada producto habilita IA sin depender de la whitelist del otro.' },
  ] as const;
  const tasks = new Map<string, { id: string }>();
  for (const spec of taskSpecs) {
    const task = await prisma.task.upsert({
      where: { id: `demo_task_${spec.key}` },
      update: {
        organizationId: organization.id,
        teamId: teams.get(spec.team)!.id,
        title: spec.title,
        description: `Trabajo real del proyecto Pulso: ${spec.title.toLowerCase()}.`,
        expectedOutcome: spec.done,
        definitionOfDone: spec.done,
        assigneeId: users.get(spec.assignee)!.id,
        createdById: users.get('admin')!.id,
        status: spec.status,
        priority: spec.priority,
        dueDate: daysFromNow(spec.due),
      },
      create: {
        id: `demo_task_${spec.key}`,
        organizationId: organization.id,
        teamId: teams.get(spec.team)!.id,
        title: spec.title,
        description: `Trabajo real del proyecto Pulso: ${spec.title.toLowerCase()}.`,
        expectedOutcome: spec.done,
        definitionOfDone: spec.done,
        assigneeId: users.get(spec.assignee)!.id,
        createdById: users.get('admin')!.id,
        status: spec.status,
        priority: spec.priority,
        dueDate: daysFromNow(spec.due),
        createdAt: hoursAgo(72),
      },
    });
    tasks.set(spec.key, task);
  }

  const worklogs = [
    { key: 'knowledge', task: 'migration', team: 'platform', author: 'nico', type: 'DELIVERY', hours: 2, title: 'Knowledge sync quedó desplegado por digest', content: 'Aplicamos la migración aditiva después de restaurar el backup cifrado. App y worker quedaron healthy y la segunda ejecución no encontró migraciones pendientes.' },
    { key: 'desktop', task: 'desktop', team: 'desktop', author: 'mora', type: 'PROGRESS', hours: 5, title: 'Desktop recuperó selector, widget e importador', content: 'La versión 0.1.28 vuelve a cargar los estilos empaquetados y mantiene funcionales el selector de proyecto y la importación Markdown/Obsidian.' },
    { key: 'gate', task: 'migration', team: 'platform', author: 'nico', type: 'DELIVERY', hours: 9, title: 'Green gate cerró con 100 pruebas unitarias y 40 PostgreSQL', content: 'Typecheck, lint, build, seguridad Electron, migraciones desde cero y upgrade sintético terminaron verdes.' },
    { key: 'gemini', task: 'onboarding', team: 'product', author: 'alma', type: 'PROGRESS', hours: 14, title: 'Personal AI ya genera texto y embeddings con Gemini', content: 'Separamos chat de embeddings y validamos una respuesta real de 768 dimensiones sin exponer la API key al cliente.' },
    { key: 'access', task: 'whitelist', team: 'product', author: 'alma', type: 'PROGRESS', hours: 20, title: 'Panel de acceso anticipado listo para la primera whitelist', content: 'El superadmin puede aprobar, rechazar y revocar solicitudes mientras el registro público continúa cerrado.' },
    { key: 'domains', task: 'demo', team: 'growth', author: 'julian', type: 'DELIVERY', hours: 27, title: 'Landing y SaaS quedaron separados en dominios propios', content: 'Marketing vive en pulso.syswarm.com y la aplicación real en pulsoapp.syswarm.com, ambos con estilos y healthchecks verificados.' },
  ] as const;
  for (const entry of worklogs) {
    const timestamp = hoursAgo(entry.hours);
    await prisma.worklogEntry.upsert({
      where: { id: `demo_worklog_${entry.key}` },
      update: {
        organizationId: organization.id,
        authorId: users.get(entry.author)!.id,
        teamId: teams.get(entry.team)!.id,
        taskId: tasks.get(entry.task)!.id,
        type: entry.type,
        status: 'PUBLISHED',
        source: 'AI_SUGGESTED',
        title: entry.title,
        content: entry.content,
        approvedById: users.get('admin')!.id,
        publishedAt: timestamp,
        createdAt: timestamp,
      },
      create: {
        id: `demo_worklog_${entry.key}`,
        organizationId: organization.id,
        authorId: users.get(entry.author)!.id,
        teamId: teams.get(entry.team)!.id,
        taskId: tasks.get(entry.task)!.id,
        type: entry.type,
        status: 'PUBLISHED',
        source: 'AI_SUGGESTED',
        title: entry.title,
        content: entry.content,
        approvedById: users.get('admin')!.id,
        publishedAt: timestamp,
        createdAt: timestamp,
      },
    });
  }

  await prisma.blocker.upsert({
    where: { id: 'demo_blocker_signing' },
    update: { status: 'OPEN', resolvedAt: null, title: 'Falta el certificado de firma de código', description: 'El instalador está validado, pero la release pública espera un certificado para Windows.' },
    create: {
      id: 'demo_blocker_signing', organizationId: organization.id, teamId: teams.get('desktop')!.id,
      taskId: tasks.get('signing')!.id, createdById: users.get('mora')!.id, status: 'OPEN',
      title: 'Falta el certificado de firma de código', description: 'El instalador está validado, pero la release pública espera un certificado para Windows.',
    },
  });
  await prisma.blocker.upsert({
    where: { id: 'demo_blocker_offsite' },
    update: { status: 'OPEN', resolvedAt: null, title: 'Falta elegir el destino offsite', description: 'El backup cifrado está fuera del VPS en F:, pero todavía falta definir un proveedor definitivo.' },
    create: {
      id: 'demo_blocker_offsite', organizationId: organization.id, teamId: teams.get('platform')!.id,
      taskId: tasks.get('offsite')!.id, createdById: users.get('nico')!.id, status: 'OPEN',
      title: 'Falta elegir el destino offsite', description: 'El backup cifrado está fuera del VPS en F:, pero todavía falta definir un proveedor definitivo.',
    },
  });

  const decisions = [
    { key: 'demo', team: 'growth', task: 'demo', requester: 'julian', title: 'Elegir el guion de la demo pública', context: 'Decidir si la historia principal muestra primero el pulso del equipo o la captura rápida desde Desktop.' },
    { key: 'entitlement', team: 'product', task: 'entitlement', requester: 'alma', title: 'Separar IA Teams de la whitelist Personal', context: 'Teams necesita su propio entitlement antes de abrir la segunda etapa de pruebas.' },
  ] as const;
  for (const decision of decisions) {
    await prisma.decisionRequest.upsert({
      where: { id: `demo_decision_${decision.key}` },
      update: { status: 'OPEN', resolvedAt: null, title: decision.title, context: decision.context },
      create: {
        id: `demo_decision_${decision.key}`,
        organizationId: organization.id,
        teamId: teams.get(decision.team)!.id,
        taskId: tasks.get(decision.task)!.id,
        requestedById: users.get(decision.requester)!.id,
        title: decision.title,
        context: decision.context,
        status: 'OPEN',
      },
    });
  }

  await prisma.lLMProviderConfig.updateMany({ where: { organizationId: organization.id }, data: { isActive: false } });
  await prisma.lLMProviderConfig.upsert({
    where: { id: 'demo_llm_gemini' },
    update: {
      providerType: 'OPENAI_COMPATIBLE',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: process.env.PULSO_PERSONAL_ACCOUNT_AI_MODEL ?? 'gemini-3.1-flash-lite',
      apiKeyEncrypted: encryptSecret(geminiKey),
      isActive: true,
    },
    create: {
      id: 'demo_llm_gemini',
      organizationId: organization.id,
      providerType: 'OPENAI_COMPATIBLE',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: process.env.PULSO_PERSONAL_ACCOUNT_AI_MODEL ?? 'gemini-3.1-flash-lite',
      apiKeyEncrypted: encryptSecret(geminiKey),
      isActive: true,
    },
  });

  console.log(JSON.stringify({
    organization: organization.name,
    slug: organization.slug,
    adminEmail: people[0]!.email,
    users: people.length,
    teams: teamSpecs.length,
    tasks: taskSpecs.length,
    publishedWorklogs: worklogs.length,
    blockers: 2,
    decisions: decisions.length,
    llm: 'gemini-openai-compatible',
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
