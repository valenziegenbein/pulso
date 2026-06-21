import { notFound } from 'next/navigation';
import { TASK_STATUS_TRANSITIONS, WORKLOG_TYPE, type TaskStatus } from '@pulso/shared';
import { requireAuth } from '@/lib/auth/context';
import { getTaskDetail } from '@/server/queries';
import { addBlockerAction, changeStatusAction } from '@/server/actions/tasks';
import { approveWorklogAction, createWorklogFormAction } from '@/server/actions/worklog';
import { AssignTaskForm } from '@/components/assign-task-form';
import { PRIORITY_LABEL, STATUS_LABEL, WORKLOG_TYPE_LABEL, formatDate } from '@/lib/labels';

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAuth();
  const detail = await getTaskDetail(ctx, id);
  if (!detail) notFound();

  const { task, people } = detail;
  const openBlockers = task.blockers.filter((b) => b.resolvedAt === null);
  const transitions = TASK_STATUS_TRANSITIONS[task.status as TaskStatus];

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-muted">{task.team.name}</p>
        <h1 className="mt-1 text-2xl font-semibold">{task.title}</h1>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
          <span>{STATUS_LABEL[task.status]}</span>
          <span>· {PRIORITY_LABEL[task.priority]}</span>
          <span>· vence {formatDate(task.dueDate)}</span>
          <span>· {task.assignee?.name ?? 'Sin responsable'}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {task.description && (
            <section className="rounded-xl border border-border bg-surface p-4 text-sm">
              <p>{task.description}</p>
            </section>
          )}

          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-2 text-sm font-medium">Definición de terminado</h2>
            {task.definitionOfDone ? (
              <p className="text-sm">{task.definitionOfDone}</p>
            ) : (
              <p className="text-sm text-amber-400">⚠ Sin definir — agregá un criterio claro de "listo".</p>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">Bloqueos</h2>
            </div>
            {openBlockers.length === 0 ? (
              <p className="text-sm text-muted">Sin bloqueos.</p>
            ) : (
              <ul className="mb-3 space-y-1 text-sm">
                {openBlockers.map((b) => (
                  <li key={b.id} className="text-red-300">
                    ● {b.description}
                  </li>
                ))}
              </ul>
            )}
            <form action={addBlockerAction} className="flex gap-2">
              <input type="hidden" name="taskId" value={task.id} />
              <input
                name="description"
                required
                placeholder="Describir un bloqueo…"
                className="flex-1 rounded-lg border border-border bg-bg p-2 text-sm outline-none focus:border-accent"
              />
              <button className="rounded-lg border border-border px-3 text-sm hover:border-accent">Marcar</button>
            </form>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium">Bitácora de la tarea</h2>
            {task.worklogEntries.length === 0 ? (
              <p className="mb-3 text-sm text-muted">Sin entradas.</p>
            ) : (
              <ul className="mb-4 space-y-2 text-sm">
                {task.worklogEntries.map((w) => (
                  <li key={w.id} className="rounded-lg border border-border bg-bg p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted">
                        [{WORKLOG_TYPE_LABEL[w.type]}] · {w.status === 'DRAFT' ? 'borrador' : 'publicada'}
                      </span>
                      {w.status === 'DRAFT' && (
                        <form action={approveWorklogAction}>
                          <input type="hidden" name="worklogId" value={w.id} />
                          <button className="rounded border border-border px-2 py-0.5 text-xs hover:border-accent">
                            Aprobar
                          </button>
                        </form>
                      )}
                    </div>
                    <p className="mt-1 font-medium">{w.title}</p>
                    <p className="text-muted">{w.content}</p>
                  </li>
                ))}
              </ul>
            )}

            <form action={createWorklogFormAction} className="space-y-2 text-sm">
              <input type="hidden" name="taskId" value={task.id} />
              <div className="flex gap-2">
                <select name="type" defaultValue="PROGRESS" className="rounded-lg border border-border bg-bg p-2">
                  {WORKLOG_TYPE.map((t) => (
                    <option key={t} value={t}>
                      {WORKLOG_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
                <input
                  name="title"
                  required
                  placeholder="Título"
                  className="flex-1 rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent"
                />
              </div>
              <textarea
                name="content"
                required
                rows={2}
                placeholder="Qué pasó…"
                className="w-full resize-none rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent"
              />
              <button className="rounded-lg border border-border px-3 py-1.5 hover:border-accent">
                Agregar entrada (borrador)
              </button>
            </form>
          </section>
        </div>

        <div className="space-y-6 lg:col-span-1">
          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium">Responsable</h2>
            <AssignTaskForm taskId={task.id} people={people} currentAssigneeId={task.assigneeId} />
          </section>

          {transitions.length > 0 && (
            <section className="rounded-xl border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-medium">Cambiar estado</h2>
              <form action={changeStatusAction} className="flex gap-2">
                <input type="hidden" name="taskId" value={task.id} />
                <select name="status" className="flex-1 rounded-lg border border-border bg-bg p-2 text-sm">
                  {transitions.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <button className="rounded-lg border border-border px-3 text-sm hover:border-accent">Aplicar</button>
              </form>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
