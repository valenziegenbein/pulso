import Link from 'next/link';
import { TASK_PRIORITY, type TaskStatus } from '@pulso/shared';
import { requireAuth } from '@/lib/auth/context';
import { getAssignablePeople, getTaskList, getTeamsPage } from '@/server/queries';
import { createTaskAction } from '@/server/actions/tasks';
import { TaskSuggestionPanel } from '@/components/teams/task-suggestion-panel';
import { Card, EmptyState, PageHeader, PriorityBadge, StatusBadge, btnPrimary, inputCls, selectCls, textareaCls } from '@/components/teams/ui';
import { PRIORITY_LABEL, STATUS_LABEL, formatDate } from '@/lib/labels';

const GROUPS: Array<[TaskStatus, string]> = [
  ['TODO', 'Pendiente'],
  ['IN_PROGRESS', 'En curso'],
  ['BLOCKED', 'Bloqueada'],
  ['IN_REVIEW', 'En revisión'],
  ['DONE', 'Terminada'],
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

      <form className="mb-6 grid gap-2 rounded-2xl border border-border bg-surface/60 p-3 md:grid-cols-4">
        <select name="team" defaultValue={filters.team ?? ''} className={selectCls}>
          <option value="">Todos los equipos</option>
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        <select name="assignee" defaultValue={filters.assignee ?? ''} className={selectCls}>
          <option value="">Cualquier responsable</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
        <select name="status" defaultValue={filters.status ?? ''} className={selectCls}>
          <option value="">Cualquier estado</option>
          {GROUPS.map(([status, label]) => <option key={status} value={status}>{label}</option>)}
        </select>
        <button className="rounded-xl bg-accent/90 px-3 py-2 text-sm font-medium text-bg transition hover:brightness-110">Filtrar</button>
      </form>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="space-y-5 lg:col-span-2">
          {GROUPS.map(([status, label]) => {
            const groupTasks = tasks.filter((task) => task.status === status);
            if (groupTasks.length === 0) return null;
            return (
              <Card key={status} title={`${label} · ${groupTasks.length}`}>
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
              </Card>
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
