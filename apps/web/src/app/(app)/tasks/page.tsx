import Link from 'next/link';
import { TASK_PRIORITY, type TaskStatus } from '@pulso/shared';
import { requireAuth } from '@/lib/auth/context';
import { getAssignablePeople, getTaskList, getTeamsPage } from '@/server/queries';
import { createTaskAction } from '@/server/actions/tasks';
import { TaskSuggestionPanel } from '@/components/teams/task-suggestion-panel';
import { PRIORITY_LABEL, STATUS_LABEL, formatDate } from '@/lib/labels';

const GROUPS: Array<[TaskStatus, string]> = [
  ['TODO', 'Pendiente'],
  ['IN_PROGRESS', 'En curso'],
  ['BLOCKED', 'Bloqueada'],
  ['IN_REVIEW', 'En revision'],
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
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tareas</h1>
          <p className="text-sm text-muted">Gestionar trabajo del equipo sin tablero gigante.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <a href="#nueva" className="rounded-lg bg-accent px-4 py-2 font-medium text-bg">Nueva tarea</a>
          <a href="#ia" className="rounded-lg border border-border px-4 py-2 hover:border-accent">Asignar con IA</a>
          <button className="rounded-lg border border-border px-3 py-2 text-muted">...</button>
        </div>
      </header>

      <form className="mb-4 grid gap-2 rounded-xl border border-border bg-surface p-3 text-sm md:grid-cols-4">
        <select name="team" defaultValue={filters.team ?? ''} className="rounded-lg border border-border bg-bg p-2">
          <option value="">Equipo</option>
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        <select name="assignee" defaultValue={filters.assignee ?? ''} className="rounded-lg border border-border bg-bg p-2">
          <option value="">Responsable</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
        <select name="status" defaultValue={filters.status ?? ''} className="rounded-lg border border-border bg-bg p-2">
          <option value="">Estado</option>
          {GROUPS.map(([status, label]) => <option key={status} value={status}>{label}</option>)}
        </select>
        <button className="rounded-lg border border-border px-3 py-2 hover:border-accent">Filtrar</button>
      </form>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          {GROUPS.map(([status, label]) => {
            const groupTasks = tasks.filter((task) => task.status === status);
            if (groupTasks.length === 0) return null;
            return (
              <div key={status} className="rounded-xl border border-border bg-surface p-4">
                <h2 className="mb-3 text-sm font-medium">{label}</h2>
                <ul className="divide-y divide-border">
                  {groupTasks.map((task) => (
                    <li key={task.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                      <div>
                        <Link href={`/tasks/${task.id}`} className="font-medium hover:text-accent">{task.title}</Link>
                        <p className="text-xs text-muted">
                          {task.team.name} · {task.assignee?.name ?? 'Sin responsable'} · ultimo avance: {task.worklogEntries[0]?.title ?? 'sin registro'}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted">{PRIORITY_LABEL[task.priority]} · {formatDate(task.dueDate)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {tasks.length === 0 && <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">No hay tareas con esos filtros.</p>}
        </section>

        <div className="space-y-6">
          <section id="nueva" className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium">Nueva tarea</h2>
            <form action={createTaskAction} className="space-y-2 text-sm">
              <input name="title" required placeholder="Titulo" className="w-full rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent" />
              <textarea name="description" rows={2} placeholder="Descripcion" className="w-full resize-none rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent" />
              <input name="expectedOutcome" placeholder="Resultado esperado" className="w-full rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent" />
              <select name="teamId" required className="w-full rounded-lg border border-border bg-bg p-2">
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
              <select name="assigneeId" className="w-full rounded-lg border border-border bg-bg p-2">
                <option value="">Sin responsable</option>
                {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
              <select name="priority" defaultValue="MEDIUM" className="w-full rounded-lg border border-border bg-bg p-2">
                {TASK_PRIORITY.filter((p) => p !== 'URGENT').map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
              <input name="definitionOfDone" placeholder="Definicion de terminado" className="w-full rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent" />
              <button className="w-full rounded-lg bg-accent px-3 py-2 font-medium text-bg">Crear tarea</button>
            </form>
          </section>

          <div id="ia">
            <TaskSuggestionPanel teams={teams.map((team) => ({ id: team.id, name: team.name }))} people={people} />
          </div>
        </div>
      </div>
    </main>
  );
}
