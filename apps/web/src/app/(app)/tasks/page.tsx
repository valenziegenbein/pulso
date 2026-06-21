import Link from 'next/link';
import { TASK_PRIORITY } from '@pulso/shared';
import { requireAuth } from '@/lib/auth/context';
import { getAssignablePeople, getTaskList, getTeamsPage } from '@/server/queries';
import { createTaskAction } from '@/server/actions/tasks';
import { PRIORITY_LABEL, STATUS_LABEL, formatDate } from '@/lib/labels';

export default async function TasksPage() {
  const ctx = await requireAuth();
  const [tasks, { teams }, people] = await Promise.all([
    getTaskList(ctx),
    getTeamsPage(ctx),
    getAssignablePeople(ctx),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Tareas</h1>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-surface p-4 lg:col-span-2">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted">No hay tareas todavía. Creá la primera →</p>
          ) : (
            <ul className="divide-y divide-border">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                  <Link href={`/tasks/${t.id}`} className="hover:text-accent">
                    {t.title}
                    <span className="ml-2 text-xs text-muted">· {t.team.name}</span>
                  </Link>
                  <span className="flex items-center gap-3 text-xs text-muted">
                    <span>{t.assignee?.name ?? 'Sin responsable'}</span>
                    <span>· {PRIORITY_LABEL[t.priority]}</span>
                    <span>· {STATUS_LABEL[t.status]}</span>
                    <span>· {formatDate(t.dueDate)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Nueva tarea</h2>
          <form action={createTaskAction} className="space-y-2 text-sm">
            <input
              name="title"
              required
              placeholder="Título"
              className="w-full rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent"
            />
            <textarea
              name="description"
              rows={2}
              placeholder="Descripción (opcional)"
              className="w-full resize-none rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent"
            />
            <select name="teamId" required className="w-full rounded-lg border border-border bg-bg p-2">
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select name="assigneeId" className="w-full rounded-lg border border-border bg-bg p-2">
              <option value="">Sin responsable</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select name="priority" defaultValue="MEDIUM" className="w-full rounded-lg border border-border bg-bg p-2">
              {TASK_PRIORITY.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
            <input type="date" name="dueDate" className="w-full rounded-lg border border-border bg-bg p-2" />
            <input
              name="definitionOfDone"
              placeholder="Definición de terminado"
              className="w-full rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent"
            />
            <button className="w-full rounded-lg bg-accent px-3 py-2 font-medium text-bg">Crear tarea</button>
          </form>
        </section>
      </div>
    </main>
  );
}
