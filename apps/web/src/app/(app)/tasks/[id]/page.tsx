import { notFound } from 'next/navigation';
import { TASK_STATUS_TRANSITIONS, WORKLOG_TYPE, type TaskStatus } from '@pulso/shared';
import { requireAuth } from '@/lib/auth/context';
import { getTaskDetail } from '@/server/queries';
import { addBlockerAction, changeStatusAction } from '@/server/actions/tasks';
import { requestDecisionAction } from '@/server/actions/decisions';
import { approveWorklogAction, createWorklogFormAction } from '@/server/actions/worklog';
import { AssignTaskForm } from '@/components/assign-task-form';
import { PRIORITY_LABEL, STATUS_LABEL, WORKLOG_TYPE_LABEL, formatDate } from '@/lib/labels';

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAuth();
  const detail = await getTaskDetail(ctx, id);
  if (!detail) notFound();

  const { task, people } = detail;
  const openBlockers = task.blockers.filter((b) => b.status === 'OPEN');
  const openDecisions = task.decisions.filter((d) => d.status === 'OPEN');
  const transitions = TASK_STATUS_TRANSITIONS[task.status as TaskStatus];

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{task.team.name}</p>
          <h1 className="mt-1 text-2xl font-semibold">{task.title}</h1>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
            <span>{STATUS_LABEL[task.status]}</span>
            <span>{PRIORITY_LABEL[task.priority]}</span>
            <span>vence {formatDate(task.dueDate)}</span>
            <span>{task.assignee?.name ?? 'Sin responsable'}</span>
          </div>
        </div>
        <div className="flex gap-2 text-sm">
          <a href="#avance" className="rounded-lg bg-accent px-4 py-2 font-medium text-bg">Registrar avance</a>
          <a href="#estado" className="rounded-lg border border-border px-4 py-2 hover:border-accent">Cambiar estado</a>
          <button className="rounded-lg border border-border px-3 py-2 text-muted">...</button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-border bg-surface p-4 text-sm">
            <h2 className="mb-2 text-sm font-medium">Descripcion</h2>
            <p className="text-muted">{task.description ?? 'Sin descripcion.'}</p>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium">Resultado y terminado</h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Resultado esperado</p>
                <p>{task.expectedOutcome ?? 'Sin resultado esperado definido.'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Definicion de terminado</p>
                <p>{task.definitionOfDone ?? 'Sin criterio de terminado definido.'}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium">Bloqueos</h2>
            {openBlockers.length === 0 ? (
              <p className="mb-3 text-sm text-muted">Sin bloqueos abiertos.</p>
            ) : (
              <ul className="mb-3 space-y-2 text-sm">
                {openBlockers.map((b) => (
                  <li key={b.id} className="rounded-lg border border-border bg-bg p-2">
                    <p className="font-medium text-red-300">{b.title}</p>
                    <p className="text-xs text-muted">{b.description}</p>
                  </li>
                ))}
              </ul>
            )}
            <form action={addBlockerAction} className="flex gap-2">
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="teamId" value={task.teamId} />
              <input name="description" required placeholder="Describir bloqueo" className="flex-1 rounded-lg border border-border bg-bg p-2 text-sm outline-none focus:border-accent" />
              <button className="rounded-lg border border-border px-3 text-sm hover:border-accent">Marcar</button>
            </form>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium">Decisiones pendientes</h2>
            {openDecisions.length === 0 ? (
              <p className="mb-3 text-sm text-muted">Sin decisiones abiertas.</p>
            ) : (
              <ul className="mb-3 space-y-2 text-sm">
                {openDecisions.map((d) => (
                  <li key={d.id} className="rounded-lg border border-border bg-bg p-2">
                    <p className="font-medium">{d.title}</p>
                    <p className="text-xs text-muted">{d.context}</p>
                  </li>
                ))}
              </ul>
            )}
            <form action={requestDecisionAction} className="space-y-2 text-sm">
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="teamId" value={task.teamId} />
              <input name="title" required placeholder="Decision necesaria" className="w-full rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent" />
              <textarea name="context" required rows={2} placeholder="Contexto breve" className="w-full resize-none rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent" />
              <button className="rounded-lg border border-border px-3 py-1.5 hover:border-accent">Pedir decision</button>
            </form>
          </section>

          <section id="avance" className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium">Bitacora asociada</h2>
            {task.worklogEntries.length === 0 ? (
              <p className="mb-3 text-sm text-muted">Sin entradas.</p>
            ) : (
              <ul className="mb-4 space-y-2 text-sm">
                {task.worklogEntries.map((w) => (
                  <li key={w.id} className="rounded-lg border border-border bg-bg p-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted">[{WORKLOG_TYPE_LABEL[w.type]}] {w.status === 'DRAFT' ? 'borrador' : 'aprobada'}</span>
                      {w.status === 'DRAFT' && (
                        <form action={approveWorklogAction}>
                          <input type="hidden" name="worklogId" value={w.id} />
                          <button className="rounded border border-border px-2 py-0.5 text-xs hover:border-accent">Aprobar</button>
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
              <input type="hidden" name="teamId" value={task.teamId} />
              <div className="flex gap-2">
                <select name="type" defaultValue="PROGRESS" className="rounded-lg border border-border bg-bg p-2">
                  {WORKLOG_TYPE.map((t) => (
                    <option key={t} value={t}>{WORKLOG_TYPE_LABEL[t]}</option>
                  ))}
                </select>
                <input name="title" required placeholder="Titulo" className="flex-1 rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent" />
              </div>
              <textarea name="content" required rows={2} placeholder="Que paso" className="w-full resize-none rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent" />
              <button className="rounded-lg border border-border px-3 py-1.5 hover:border-accent">Guardar borrador</button>
            </form>
          </section>
        </div>

        <div className="space-y-6 lg:col-span-1">
          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium">Responsable</h2>
            <AssignTaskForm taskId={task.id} people={people} currentAssigneeId={task.assigneeId} />
          </section>

          {transitions.length > 0 && (
            <section id="estado" className="rounded-xl border border-border bg-surface p-4">
              <h2 className="mb-3 text-sm font-medium">Cambiar estado</h2>
              <form action={changeStatusAction} className="space-y-2">
                <input type="hidden" name="taskId" value={task.id} />
                <select name="status" className="w-full rounded-lg border border-border bg-bg p-2 text-sm">
                  {transitions.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
                <button className="w-full rounded-lg border border-border px-3 py-1.5 text-sm hover:border-accent">Aplicar</button>
              </form>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
