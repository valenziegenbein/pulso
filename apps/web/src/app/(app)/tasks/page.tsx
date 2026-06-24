import Link from 'next/link';
import { TASK_PRIORITY, type TaskStatus } from '@pulso/shared';
import { requireAuth } from '@/lib/auth/context';
import { getAssignablePeople, getTaskList, getTeamsPage } from '@/server/queries';
import { createTaskAction } from '@/server/actions/tasks';
import { TaskSuggestionPanel } from '@/components/teams/task-suggestion-panel';
import { Card, Dot, EmptyState, PageHeader, PriorityBadge, btnPrimary, inputCls, selectCls, textareaCls } from '@/components/teams/ui';
import { PRIORITY_LABEL, formatDate } from '@/lib/labels';

const GROUPS: Array<{ status: TaskStatus; label: string; tone: 'muted' | 'accent' | 'danger' | 'info' | 'ok' }> = [
  { status: 'TODO', label: 'Pendiente', tone: 'muted' },
  { status: 'IN_PROGRESS', label: 'En curso', tone: 'accent' },
  { status: 'BLOCKED', label: 'Bloqueada', tone: 'danger' },
  { status: 'IN_REVIEW', label: 'En revisión', tone: 'info' },
  { status: 'DONE', label: 'Terminada', tone: 'ok' },
];

export default async function TasksPage({
  searchParams,
}: {
  searchParams?: Promise<{ team?: string; assignee?: string; status?: string }>;
}) {
  const ctx = await requireAuth();
  const filters = (await searchParams) ?? {};
  const [allTasks, { teams }, people] = await Promise.all([getTaskList(ctx), getTeamsPage(ctx), getAssignablePeople(ctx)]);
  const tasks = allTasks.filter((task) => {
    if (filters.team && task.teamId !== filters.team) return false;
    if (filters.assignee && task.assigneeId !== filters.assignee) return false;
    if (filters.status && task.status !== filters.status) return false;
    return true;
  });

  // Conserva team/assignee al cambiar el chip de estado.
  const chipHref = (status?: string) => {
    const q = new URLSearchParams();
    if (filters.team) q.set('team', filters.team);
    if (filters.assignee) q.set('assignee', filters.assignee);
    if (status) q.set('status', status);
    const s = q.toString();
    return s ? `/tasks?${s}` : '/tasks';
  };
  const shownGroups = GROUPS.filter((g) => !filters.status || g.status === filters.status);

  return (
    <main className="pulso-reveal mx-auto max-w-6xl px-6 py-10 sm:py-12">
      <PageHeader
        kicker="Trabajo del equipo"
        title="Tareas"
        subtitle="Coordinar sin tablero gigante."
        actions={
          <>
            <a href="#nueva" className={btnPrimary}>Nueva tarea</a>
            <a href="#ia" className="rounded-full border border-border px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-fg">Asignar con IA</a>
          </>
        }
      />

      {/* Filtro rápido por estado (chips) */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <FilterChip href={chipHref()} active={!filters.status} label="Todo" count={allTasks.filter((t) => matchTeamAssignee(t, filters)).length} />
        {GROUPS.map((g) => (
          <FilterChip
            key={g.status}
            href={chipHref(g.status)}
            active={filters.status === g.status}
            label={g.label}
            tone={g.tone}
            count={allTasks.filter((t) => t.status === g.status && matchTeamAssignee(t, filters)).length}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="space-y-5 lg:col-span-2">
          {/* Filtro por equipo / responsable (secundario) */}
          <form className="grid gap-2 rounded-2xl border border-border bg-surface/40 p-3 sm:grid-cols-[1fr_1fr_auto]">
            {filters.status && <input type="hidden" name="status" value={filters.status} />}
            <select name="team" defaultValue={filters.team ?? ''} className={selectCls}>
              <option value="">Todos los equipos</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
            <select name="assignee" defaultValue={filters.assignee ?? ''} className={selectCls}>
              <option value="">Cualquier responsable</option>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
            <button className="rounded-xl border border-border px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-fg">Filtrar</button>
          </form>

          {shownGroups.map((g) => {
            const groupTasks = tasks.filter((task) => task.status === g.status);
            if (groupTasks.length === 0) return null;
            return (
              <section key={g.status} className="rounded-2xl border border-border bg-surface/60 p-5">
                <h2 className="font-meta mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted">
                  <Dot tone={g.tone} /> {g.label} · {groupTasks.length}
                </h2>
                <ul className="divide-y divide-border/60">
                  {groupTasks.map((task) => (
                    <li key={task.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <Link href={`/tasks/${task.id}`} className="text-sm transition hover:text-accent">{task.title}</Link>
                        <p className="font-meta mt-0.5 truncate text-[11px] text-muted">
                          {task.team.name} · {task.assignee?.name ?? 'Sin responsable'} · {task.worklogEntries[0]?.title ?? 'sin avance'}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-3">
                        <PriorityBadge priority={task.priority} />
                        <span className="font-meta text-[11px] text-muted">{formatDate(task.dueDate)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {tasks.length === 0 && <EmptyState>No hay tareas con esos filtros.</EmptyState>}
        </section>

        <div className="space-y-6">
          <Card id="nueva" title="Nueva tarea">
            <form action={createTaskAction} className="space-y-2.5">
              <input name="title" required placeholder="Título" className={inputCls} />
              <textarea name="description" rows={2} placeholder="Descripción" className={textareaCls} />
              <input name="expectedOutcome" placeholder="Resultado esperado" className={inputCls} />
              <select name="teamId" required className={selectCls}>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
              <select name="assigneeId" className={selectCls}>
                <option value="">Sin responsable</option>
                {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
              <select name="priority" defaultValue="MEDIUM" className={selectCls}>
                {TASK_PRIORITY.filter((p) => p !== 'URGENT').map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
              <input name="definitionOfDone" placeholder="Definición de terminado" className={inputCls} />
              <button className="w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-bg transition hover:brightness-110">Crear tarea</button>
            </form>
          </Card>

          <div id="ia">
            <TaskSuggestionPanel teams={teams.map((team) => ({ id: team.id, name: team.name }))} people={people} />
          </div>
        </div>
      </div>
    </main>
  );
}

function matchTeamAssignee(t: { teamId: string; assigneeId: string | null }, f: { team?: string; assignee?: string }): boolean {
  if (f.team && t.teamId !== f.team) return false;
  if (f.assignee && t.assigneeId !== f.assignee) return false;
  return true;
}

function FilterChip({
  href,
  active,
  label,
  count,
  tone,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  tone?: 'muted' | 'accent' | 'danger' | 'info' | 'ok';
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs transition ${
        active ? 'border-accent text-accent' : 'border-border text-muted hover:border-muted hover:text-fg'
      }`}
    >
      {tone && <Dot tone={tone} />}
      {label}
      <span className="font-meta text-[10px] text-muted/70">{count}</span>
    </Link>
  );
}
