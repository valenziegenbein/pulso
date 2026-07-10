import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/context';
import { getAssignablePeople, getTeamDetail } from '@/server/queries';
import { TaskSuggestionPanel } from '@/components/teams/task-suggestion-panel';
import { InviteMemberForm } from '@/components/teams/invite-member-form';
import { Card, EmptyState, PriorityBadge, StatusBadge } from '@/components/teams/ui';

const ROLE_OPTIONS = [
  ['MEMBER', 'Miembro'],
  ['TEAM_ADMIN', 'Admin de equipo'],
] as const;

const ROLE_LABEL: Record<string, string> = {
  MEMBER: 'Miembro',
  TEAM_ADMIN: 'Admin de equipo',
  ORG_ADMIN: 'Admin de organización',
};

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAuth();
  const [team, people] = await Promise.all([getTeamDetail(ctx, id), getAssignablePeople(ctx)]);
  if (!team) notFound();

  const activeTasks = team.tasks.filter((task) => task.status !== 'DONE' && task.status !== 'CANCELLED');

  return (
    <main className="pulso-reveal mx-auto max-w-6xl px-6 py-10 sm:py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-meta mb-2 text-[11px] uppercase tracking-[0.22em] text-accent">Equipo</p>
          <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">{team.name}</h1>
          <p className="mt-2 text-muted">{team.focus ?? team.description ?? 'Sin foco definido'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="#miembro" className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition hover:brightness-110">Añadir miembro</a>
          <a href="#tarea" className="rounded-full border border-border px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-fg">Asignar tarea</a>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Miembros">
          <ul className="space-y-2.5">
            {team.memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{m.user.name}</span>
                <span className="font-meta text-[10px] uppercase tracking-[0.14em] text-muted">{ROLE_LABEL[m.role.key] ?? m.role.key}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Tareas activas" className="lg:col-span-2">
          {activeTasks.length === 0 ? (
            <EmptyState>Sin tareas activas.</EmptyState>
          ) : (
            <ul className="divide-y divide-border/60">
              {activeTasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <Link href={`/tasks/${task.id}`} className="min-w-0 truncate text-sm transition hover:text-accent">{task.title}</Link>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="font-meta text-[11px] text-muted">{task.assignee?.name ?? 'Sin responsable'}</span>
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={task.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Bloqueos">
          {team.blockers.length === 0 ? (
            <p className="text-sm text-muted/70">Sin bloqueos abiertos.</p>
          ) : (
            <ul className="space-y-2.5">
              {team.blockers.map((b) => (
                <li key={b.id}>
                  <p className="text-sm font-medium text-[var(--danger)]">{b.title}</p>
                  <p className="text-xs text-muted">{b.description}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Bitácora reciente" className="lg:col-span-2">
          {team.worklogEntries.length === 0 ? (
            <EmptyState>Sin entradas recientes.</EmptyState>
          ) : (
            <ul className="space-y-2.5">
              {team.worklogEntries.map((entry) => (
                <li key={entry.id} className="rounded-xl border border-border bg-bg/40 p-3">
                  <p className="text-sm font-medium">{entry.title}</p>
                  <p className="font-meta mt-0.5 text-[11px] text-muted">{entry.author.name}{entry.task ? ` · ${entry.task.title}` : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card id="miembro" title="Añadir miembro">
          <InviteMemberForm teams={[]} roleOptions={ROLE_OPTIONS} fixedTeamId={team.id} />
        </Card>

        <div id="tarea" className="lg:col-span-2">
          <TaskSuggestionPanel teams={[{ id: team.id, name: team.name }]} people={people} />
        </div>
      </div>
    </main>
  );
}
