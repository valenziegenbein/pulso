import Link from 'next/link';
import { requireAuth } from '@/lib/auth/context';
import { getAssignablePeople, getTasksBoard, getTeamsPage } from '@/server/queries';
import { TasksCreate } from '@/components/teams/tasks-create';
import { Card, Dot, EmptyState, PriorityBadge, StatusBadge } from '@/components/teams/ui';

type BoardData = Awaited<ReturnType<typeof getTasksBoard>>;
type Project = BoardData['projects'][number];
type ActiveTask = BoardData['activeTasks'][number];

const TONE_BY_STATUS: Record<string, 'muted' | 'accent' | 'danger' | 'info' | 'ok'> = {
  BACKLOG: 'muted',
  TODO: 'muted',
  IN_PROGRESS: 'accent',
  BLOCKED: 'danger',
  IN_REVIEW: 'info',
  DONE: 'ok',
  CANCELLED: 'muted',
};

export default async function TasksPage() {
  const ctx = await requireAuth();
  const [{ projects, activeTasks }, { teams }, people] = await Promise.all([
    getTasksBoard(ctx),
    getTeamsPage(ctx),
    getAssignablePeople(ctx),
  ]);

  return (
    <main className="pulso-reveal mx-auto max-w-6xl px-6 py-10 sm:py-12">
      <TasksCreate teams={teams.map((t) => ({ id: t.id, name: t.name }))} people={people} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Proyectos (tarjetas) */}
        <section className="lg:col-span-2">
          {projects.length === 0 ? (
            <EmptyState>Todavía no hay proyectos. Creá el primero con “Nuevo proyecto”.</EmptyState>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.map((p) => (
                <ProjectCard key={p.id} p={p} />
              ))}
            </div>
          )}
        </section>

        {/* Tareas activas (tabla) */}
        <div>
          <Card title={`Tareas activas · ${activeTasks.length}`}>
            {activeTasks.length === 0 ? (
              <p className="text-sm text-muted/70">Las tareas activas de tus proyectos aparecen acá.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {activeTasks.map((t) => (
                  <ActiveRow key={t.id} t={t} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}

function ProjectCard({ p }: { p: Project }) {
  const total = p.subtasks.length;
  const done = p.subtasks.filter((s) => s.status === 'DONE').length;
  const blockers = p.blockers.length;
  const names = new Set<string>();
  if (p.assignee?.name) names.add(p.assignee.name);
  for (const s of p.subtasks) if (s.assignee?.name) names.add(s.assignee.name);
  const people = [...names];

  return (
    <Link
      href={`/tasks/${p.id}`}
      className="group flex flex-col rounded-2xl border border-border bg-surface/60 p-5 transition hover:-translate-y-0.5 hover:border-accent/50"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl leading-tight transition group-hover:text-accent">{p.title}</h2>
        <StatusBadge status={p.status} />
      </div>
      {p.description && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{p.description}</p>}
      <p className="font-meta mt-3 truncate text-[11px] uppercase tracking-wide text-muted/80">
        {p.team.name} · {people.length ? people.slice(0, 3).join(', ') : 'Sin asignados'}
      </p>
      <div className="font-meta mt-4 flex items-center gap-3 border-t border-border/50 pt-3 text-[11px] text-muted">
        <span>{total ? `${done}/${total} tareas` : 'Sin tareas aún'}</span>
        {blockers > 0 && (
          <>
            <span>·</span>
            <span className="text-[var(--danger)]">{blockers} bloqueos</span>
          </>
        )}
      </div>
    </Link>
  );
}

function ActiveRow({ t }: { t: ActiveTask }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 transition hover:text-accent">
        <span className="flex items-center gap-2">
          <Dot tone={TONE_BY_STATUS[t.status] ?? 'muted'} />
          <span className="truncate text-sm">{t.title}</span>
        </span>
        <span className="font-meta mt-0.5 block truncate pl-4 text-[10px] uppercase tracking-wide text-muted/70">
          {t.parent?.title ?? 'Proyecto'} · {t.assignee?.name ?? 'sin responsable'}
        </span>
      </Link>
      <PriorityBadge priority={t.priority} />
    </li>
  );
}
