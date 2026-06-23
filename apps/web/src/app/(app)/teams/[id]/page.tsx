import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/context';
import { getAssignablePeople, getTeamDetail } from '@/server/queries';
import { invitePersonAction } from '@/server/actions/teams';
import { TaskSuggestionPanel } from '@/components/teams/task-suggestion-panel';
import { PRIORITY_LABEL, STATUS_LABEL } from '@/lib/labels';

const ROLE_OPTIONS = [
  ['MEMBER', 'Miembro'],
  ['TEAM_ADMIN', 'Admin de equipo'],
] as const;

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAuth();
  const [team, people] = await Promise.all([getTeamDetail(ctx, id), getAssignablePeople(ctx)]);
  if (!team) notFound();

  const activeTasks = team.tasks.filter((task) => task.status !== 'DONE' && task.status !== 'CANCELLED');

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Equipo</p>
          <h1 className="text-2xl font-semibold">{team.name}</h1>
          <p className="text-sm text-muted">{team.focus ?? team.description ?? 'Sin foco definido'}</p>
        </div>
        <div className="flex gap-2 text-sm">
          <a href="#miembro" className="rounded-lg bg-accent px-4 py-2 font-medium text-bg">Añadir miembro</a>
          <a href="#tarea" className="rounded-lg border border-border px-4 py-2 hover:border-accent">Asignar tarea</a>
          <button className="rounded-lg border border-border px-3 py-2 text-muted">...</button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Miembros</h2>
          <ul className="space-y-2 text-sm">
            {team.memberships.map((m) => (
              <li key={m.id} className="flex justify-between gap-3">
                <span>{m.user.name}</span>
                <span className="text-xs text-muted">{m.role.key}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium">Tareas activas</h2>
          {activeTasks.length === 0 ? (
            <p className="text-sm text-muted">Sin tareas activas.</p>
          ) : (
            <ul className="divide-y divide-border">
              {activeTasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <Link href={`/tasks/${task.id}`} className="hover:text-accent">{task.title}</Link>
                  <span className="text-xs text-muted">{task.assignee?.name ?? 'Sin responsable'} · {PRIORITY_LABEL[task.priority]} · {STATUS_LABEL[task.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Bloqueos</h2>
          {team.blockers.length === 0 ? (
            <p className="text-sm text-muted">Sin bloqueos abiertos.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {team.blockers.map((b) => (
                <li key={b.id}>
                  <p className="font-medium">{b.title}</p>
                  <p className="text-xs text-muted">{b.description}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium">Bitacora reciente</h2>
          {team.worklogEntries.length === 0 ? (
            <p className="text-sm text-muted">Sin entradas recientes.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {team.worklogEntries.map((entry) => (
                <li key={entry.id} className="rounded-lg border border-border bg-bg p-2">
                  <p className="font-medium">{entry.title}</p>
                  <p className="text-xs text-muted">{entry.author.name}{entry.task ? ` · ${entry.task.title}` : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="miembro" className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Añadir miembro</h2>
          <form action={invitePersonAction} className="space-y-2 text-sm">
            <input type="hidden" name="teamId" value={team.id} />
            <input name="name" required placeholder="Nombre" className="w-full rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent" />
            <input name="email" type="email" required placeholder="Email" className="w-full rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent" />
            <select name="roleKey" defaultValue="MEMBER" className="w-full rounded-lg border border-border bg-bg p-2">
              {ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button className="w-full rounded-lg bg-accent px-3 py-2 font-medium text-bg">Añadir miembro</button>
          </form>
        </section>

        <div id="tarea" className="lg:col-span-2">
          <TaskSuggestionPanel teams={[{ id: team.id, name: team.name }]} people={people} />
        </div>
      </div>
    </main>
  );
}
