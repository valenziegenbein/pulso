import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TASK_STATUS_TRANSITIONS, WORKLOG_TYPE, type TaskStatus } from '@pulso/shared';
import { requireAuth } from '@/lib/auth/context';
import { getTaskDetail } from '@/server/queries';
import { addBlockerAction, changeStatusAction, createTaskAction } from '@/server/actions/tasks';
import { requestDecisionAction } from '@/server/actions/decisions';
import { approveWorklogAction, createWorklogFormAction } from '@/server/actions/worklog';
import { AssignTaskForm } from '@/components/assign-task-form';
import { Card, PriorityBadge, StatusBadge, btnPrimary, inputCls, selectCls, textareaCls } from '@/components/teams/ui';
import { STATUS_LABEL, WORKLOG_TYPE_LABEL, formatDate } from '@/lib/labels';

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
    <main className="pulso-reveal mx-auto max-w-5xl px-6 py-10 sm:py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-meta mb-2 text-[11px] uppercase tracking-[0.22em] text-accent">{task.team.name}</p>
          <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">{task.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            <span className="font-meta text-[11px] text-muted">vence {formatDate(task.dueDate)}</span>
            <span className="font-meta text-[11px] text-muted">{task.assignee?.name ?? 'Sin responsable'}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="#avance" className={btnPrimary}>Registrar avance</a>
          <a href="#estado" className="rounded-full border border-border px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-fg">Cambiar estado</a>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Descripción">
            <p className="text-sm leading-relaxed text-fg/90">{task.description ?? 'Sin descripción.'}</p>
          </Card>

          <Card title={`Subtareas · ${task.subtasks.length}`}>
            {task.subtasks.length === 0 ? (
              <p className="mb-4 text-sm text-muted/70">Sin subtareas todavía. Dividí el proyecto en pasos concretos.</p>
            ) : (
              <ul className="mb-4 divide-y divide-border/60">
                {task.subtasks.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <Link href={`/tasks/${s.id}`} className="min-w-0 truncate text-sm transition hover:text-accent">{s.title}</Link>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="font-meta text-[11px] text-muted">{s.assignee?.name ?? 'Sin responsable'}</span>
                      <StatusBadge status={s.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <form action={createTaskAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="teamId" value={task.teamId} />
              <input type="hidden" name="parentTaskId" value={task.id} />
              <input name="title" required placeholder="Nueva subtarea" className={`${inputCls} min-w-[12rem] flex-1`} />
              <select name="assigneeId" defaultValue={ctx.user.id} className={`${selectCls} sm:max-w-[12rem]`}>
                <option value="">Sin responsable</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.id === ctx.user.id ? ' (yo)' : ''}</option>
                ))}
              </select>
              <button className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:brightness-110">Agregar</button>
            </form>
          </Card>

          <Card title="Resultado y terminado">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="font-meta mb-1 text-[10px] uppercase tracking-[0.16em] text-muted">Resultado esperado</p>
                <p className="text-sm">{task.expectedOutcome ?? 'Sin resultado esperado definido.'}</p>
              </div>
              <div>
                <p className="font-meta mb-1 text-[10px] uppercase tracking-[0.16em] text-muted">Definición de terminado</p>
                <p className="text-sm">{task.definitionOfDone ?? 'Sin criterio de terminado definido.'}</p>
              </div>
            </div>
          </Card>

          <Card title="Bloqueos">
            {openBlockers.length === 0 ? (
              <p className="mb-3 text-sm text-muted/70">Sin bloqueos abiertos.</p>
            ) : (
              <ul className="mb-4 space-y-2">
                {openBlockers.map((b) => (
                  <li key={b.id} className="rounded-xl border border-[var(--danger)]/30 bg-bg/40 p-3">
                    <p className="text-sm font-medium text-[var(--danger)]">{b.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{b.description}</p>
                  </li>
                ))}
              </ul>
            )}
            <form action={addBlockerAction} className="flex gap-2">
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="teamId" value={task.teamId} />
              <input name="description" required placeholder="Describir un bloqueo" className={inputCls} />
              <button className="shrink-0 rounded-xl border border-border px-4 text-sm transition hover:border-accent">Marcar</button>
            </form>
          </Card>

          <Card title="Decisiones pendientes">
            {openDecisions.length === 0 ? (
              <p className="mb-3 text-sm text-muted/70">Sin decisiones abiertas.</p>
            ) : (
              <ul className="mb-4 space-y-2">
                {openDecisions.map((d) => (
                  <li key={d.id} className="rounded-xl border border-border bg-bg/40 p-3">
                    <p className="text-sm font-medium">{d.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{d.context}</p>
                  </li>
                ))}
              </ul>
            )}
            <form action={requestDecisionAction} className="space-y-2">
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="teamId" value={task.teamId} />
              <input name="title" required placeholder="Decisión necesaria" className={inputCls} />
              <textarea name="context" required rows={2} placeholder="Contexto breve" className={textareaCls} />
              <button className="rounded-full border border-border px-4 py-1.5 text-sm transition hover:border-accent">Pedir decisión</button>
            </form>
          </Card>

          <Card id="avance" title="Bitácora asociada">
            {task.worklogEntries.length === 0 ? (
              <p className="mb-4 text-sm text-muted/70">Sin entradas.</p>
            ) : (
              <ul className="mb-5 space-y-2.5">
                {task.worklogEntries.map((w) => (
                  <li key={w.id} className="rounded-xl border border-border bg-bg/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-meta text-[10px] uppercase tracking-wide text-muted">
                        {WORKLOG_TYPE_LABEL[w.type]} · {w.status === 'DRAFT' ? 'borrador' : 'aprobada'}
                      </span>
                      {w.status === 'DRAFT' && (
                        <form action={approveWorklogAction}>
                          <input type="hidden" name="worklogId" value={w.id} />
                          <button className="font-meta rounded-full border border-border px-3 py-0.5 text-[11px] transition hover:border-accent">Aprobar</button>
                        </form>
                      )}
                    </div>
                    <p className="mt-1.5 font-medium">{w.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted">{w.content}</p>
                  </li>
                ))}
              </ul>
            )}

            <form action={createWorklogFormAction} className="space-y-2.5">
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="teamId" value={task.teamId} />
              <div className="flex gap-2">
                <select name="type" defaultValue="PROGRESS" className={`${selectCls} max-w-[10rem]`}>
                  {WORKLOG_TYPE.map((t) => (
                    <option key={t} value={t}>{WORKLOG_TYPE_LABEL[t]}</option>
                  ))}
                </select>
                <input name="title" required placeholder="Título" className={inputCls} />
              </div>
              <textarea name="content" required rows={2} placeholder="¿Qué pasó?" className={textareaCls} />
              <p className="font-meta flex items-center justify-between gap-3 pt-0.5 text-[10px] uppercase tracking-[0.16em] text-muted/70">
                <span>✦ la IA propone · vos aprobás</span>
                <button className="rounded-full border border-border px-4 py-1.5 text-[11px] normal-case tracking-normal text-fg transition hover:border-accent">Guardar borrador</button>
              </p>
            </form>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-1">
          <Card title="Responsable">
            <AssignTaskForm taskId={task.id} people={people} currentAssigneeId={task.assigneeId} />
          </Card>

          {transitions.length > 0 && (
            <Card id="estado" title="Cambiar estado">
              <form action={changeStatusAction} className="space-y-2.5">
                <input type="hidden" name="taskId" value={task.id} />
                <select name="status" className={selectCls}>
                  {transitions.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
                </select>
                <button className="w-full rounded-xl border border-border px-3 py-2 text-sm transition hover:border-accent">Aplicar</button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
