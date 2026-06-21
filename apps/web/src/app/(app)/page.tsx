import Link from 'next/link';
import { requireAuth } from '@/lib/auth/context';
import { getPersonalDashboard } from '@/server/queries';
import { approveWorklogAction } from '@/server/actions/worklog';
import { QuickWorklogWidget } from '@/components/quick-worklog-widget';
import { OpenWidgetButton } from '@/components/open-widget-button';
import { PRIORITY_LABEL, STATUS_LABEL, WORKLOG_TYPE_LABEL, formatDate } from '@/lib/labels';

export default async function DashboardPage() {
  const ctx = await requireAuth();
  const { tasks, agenda, worklog, overload } = await getPersonalDashboard(ctx);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Hola, {ctx.user.name.split(' ')[0]}</h1>
          <p className="text-sm text-muted">Qué tengo que hacer, qué está bloqueado, qué necesita decisión.</p>
        </div>
        <OpenWidgetButton />
      </header>

      {overload.shouldWarn && (
        <div
          className={`mb-6 rounded-xl border p-4 ${
            overload.level === 'critical' ? 'border-red-500/40 bg-red-500/10' : 'border-amber-500/40 bg-amber-500/10'
          }`}
        >
          <p className="text-sm font-medium">
            {overload.level === 'critical' ? 'Carga crítica' : 'Atención a tu carga'}
          </p>
          <ul className="mt-1 list-inside list-disc text-xs text-muted">
            {overload.signals.map((s) => (
              <li key={s.code}>{s.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium">Mis tareas activas</h2>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted">No tenés tareas activas.</p>
            ) : (
              <ul className="divide-y divide-border">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                    <Link href={`/tasks/${t.id}`} className="hover:text-accent">
                      {t.title}
                      {t.blockers.length > 0 && <span className="ml-2 text-xs text-red-400">● bloqueada</span>}
                    </Link>
                    <span className="flex items-center gap-3 text-xs text-muted">
                      <span>{PRIORITY_LABEL[t.priority]}</span>
                      <span>· {STATUS_LABEL[t.status]}</span>
                      <span>· {formatDate(t.dueDate)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium">Bitácora reciente</h2>
            {worklog.length === 0 ? (
              <p className="text-sm text-muted">Sin entradas todavía. Registrá un avance →</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {worklog.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-3">
                    <span className="truncate">
                      <span className="text-xs text-muted">[{WORKLOG_TYPE_LABEL[w.type]}]</span> {w.title}
                    </span>
                    {w.status === 'DRAFT' ? (
                      <form action={approveWorklogAction}>
                        <input type="hidden" name="worklogId" value={w.id} />
                        <button className="shrink-0 rounded border border-border px-2 py-0.5 text-xs hover:border-accent">
                          Aprobar
                        </button>
                      </form>
                    ) : (
                      <span className="shrink-0 text-xs text-emerald-400">publicada</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium">Próximo en mi agenda</h2>
            {agenda.length === 0 ? (
              <p className="text-sm text-muted">Sin eventos próximos.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {agenda.map((e) => (
                  <li key={e.id} className="flex justify-between">
                    <span>{e.title}</span>
                    <span className="text-xs text-muted">{formatDate(e.startsAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="lg:col-span-1">
          <QuickWorklogWidget
            taskId={tasks[0]?.id}
            task={tasks[0] ? { title: tasks[0].title, teamName: tasks[0].team.name } : undefined}
          />
        </div>
      </div>
    </main>
  );
}
