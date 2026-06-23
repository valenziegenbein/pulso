import Link from 'next/link';
import { PERMISSIONS } from '@pulso/domain';
import { hasPermission, requireAuth } from '@/lib/auth/context';
import { getAdminDashboard, getAssignablePeople, getMemberDashboard } from '@/server/queries';
import { approveWorklogAction } from '@/server/actions/worklog';
import { QuickWorklogWidget } from '@/components/quick-worklog-widget';
import { OpenWidgetButton } from '@/components/open-widget-button';
import { TaskSuggestionPanel } from '@/components/teams/task-suggestion-panel';
import { PRIORITY_LABEL, STATUS_LABEL, WORKLOG_TYPE_LABEL, formatDate } from '@/lib/labels';

export default async function DashboardPage() {
  const ctx = await requireAuth();
  if (hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW_ADMIN)) {
    const [data, people] = await Promise.all([getAdminDashboard(ctx), getAssignablePeople(ctx)]);
    const inProgress = data.byStatus.IN_PROGRESS ?? 0;
    const firstName = ctx.user.name.split(' ')[0] ?? ctx.user.name;
    const overloaded = data.perPerson.filter((p) => p.active >= 4 || p.high >= 2 || p.blocked > 0);

    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Hola, {firstName}</h1>
            <p className="text-sm text-muted">Que esta avanzando, que esta bloqueado, que necesita decision.</p>
          </div>
          <div className="flex gap-2 text-sm">
            <a href="#asignar" className="rounded-lg bg-accent px-4 py-2 font-medium text-bg">Asignar tarea</a>
            <Link href="/teams" className="rounded-lg border border-border px-4 py-2 hover:border-accent">Añadir equipo</Link>
            <button className="rounded-lg border border-border px-3 py-2 text-muted">...</button>
          </div>
        </header>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Equipos activos" value={data.teams.length} />
          <Stat label="Tareas en curso" value={inProgress} />
          <Stat label="Bloqueos abiertos" value={data.openBlockers.length} />
          <Stat label="Decisiones pendientes" value={data.decisions.length} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-xl border border-border bg-surface p-4 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">Equipos</h2>
              <Link href="/teams" className="text-xs text-muted hover:text-fg">Ver todos</Link>
            </div>
            <ul className="divide-y divide-border">
              {data.teams.map((team) => {
                const blockers = team.tasks.reduce((sum, task) => sum + task.blockers.length, 0) + team.blockers.length;
                const last = team.tasks.flatMap((task) => task.worklogEntries).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
                return (
                  <li key={team.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <div>
                      <Link href={`/teams/${team.id}`} className="font-medium hover:text-accent">{team.name}</Link>
                      <p className="text-xs text-muted">{team.focus ?? 'Sin foco definido'}</p>
                      <p className="mt-1 text-xs text-muted">Ultimo avance: {last?.title ?? 'sin registros recientes'}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                      <span>{team.tasks.length} activas</span>
                      <span>{blockers} bloqueos</span>
                      <Link href={`/teams/${team.id}`} className="rounded border border-border px-2 py-1 hover:border-accent">Ver</Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <div id="asignar">
            <TaskSuggestionPanel teams={data.teams.map((t) => ({ id: t.id, name: t.name }))} people={people} />
          </div>

          <section className="rounded-xl border border-border bg-surface p-4 lg:col-span-2">
            <h2 className="mb-3 text-sm font-medium">Necesita atencion</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <Attention title="Bloqueos" items={data.openBlockers.map((b) => `${b.task?.title ?? b.title}: ${b.description}`)} />
              <Attention title="Decisiones" items={data.decisions.map((d) => `${d.team.name}: ${d.title}`)} />
              <Attention title="Carga a cuidar" items={overloaded.map((p) => `${p.user.name}: ${p.active} activas`)} />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-medium">Resultados recientes</h2>
            {data.recentWorklog.length === 0 ? (
              <p className="text-sm text-muted">Sin avances publicados.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.recentWorklog.map((w) => (
                  <li key={w.id}>
                    <p className="truncate">{w.title}</p>
                    <p className="text-xs text-muted">{w.team?.name ?? w.task?.team.name ?? 'Equipo'} · {w.author.name}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    );
  }

  const { tasks, agenda, worklog, openBlockers, decisions } = await getMemberDashboard(ctx);
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Mis tareas</h1>
          <p className="text-sm text-muted">Avances, bloqueos y decisiones de tu equipo. Sin vigilancia.</p>
        </div>
        <OpenWidgetButton />
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-surface p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium">Mis tareas activas</h2>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted">No tenes tareas activas.</p>
          ) : (
            <ul className="divide-y divide-border">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                  <Link href={`/tasks/${t.id}`} className="hover:text-accent">
                    {t.title}
                    {t.blockers.length > 0 && <span className="ml-2 text-xs text-red-400">bloqueada</span>}
                  </Link>
                  <span className="text-xs text-muted">{PRIORITY_LABEL[t.priority]} · {STATUS_LABEL[t.status]} · {formatDate(t.dueDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <QuickWorklogWidget taskId={tasks[0]?.id} task={tasks[0] ? { title: tasks[0].title, teamName: tasks[0].team.name } : undefined} />

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Mis bloqueos</h2>
          <Attention title="" items={openBlockers.map((b) => `${b.task?.title ?? b.title}: ${b.description}`)} />
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Proximo en mi agenda</h2>
          <Attention title="" items={agenda.map((e) => `${e.title} · ${formatDate(e.startsAt)}`)} />
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Decisiones pendientes</h2>
          <Attention title="" items={decisions.map((d) => `${d.team.name}: ${d.title}`)} />
        </section>

        <section className="rounded-xl border border-border bg-surface p-4 lg:col-span-3">
          <h2 className="mb-3 text-sm font-medium">Bitacora reciente</h2>
          {worklog.length === 0 ? (
            <p className="text-sm text-muted">Sin entradas todavia.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {worklog.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3">
                  <span className="truncate"><span className="text-xs text-muted">[{WORKLOG_TYPE_LABEL[w.type]}]</span> {w.title}</span>
                  {w.status === 'DRAFT' ? (
                    <form action={approveWorklogAction}>
                      <input type="hidden" name="worklogId" value={w.id} />
                      <button className="rounded border border-border px-2 py-0.5 text-xs hover:border-accent">Aprobar</button>
                    </form>
                  ) : (
                    <span className="text-xs text-emerald-400">aprobada</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function Attention({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      {title && <p className="mb-1 text-xs uppercase tracking-wide text-muted">{title}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-muted">Sin pendientes.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.slice(0, 5).map((item, i) => (
            <li key={i} className="text-muted">{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
