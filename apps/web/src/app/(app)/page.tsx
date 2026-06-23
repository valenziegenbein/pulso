import Link from 'next/link';
import { PERMISSIONS } from '@pulso/domain';
import { hasPermission, requireAuth } from '@/lib/auth/context';
import { getAdminDashboard, getAssignablePeople, getMemberDashboard } from '@/server/queries';
import { approveWorklogAction } from '@/server/actions/worklog';
import { QuickWorklogWidget } from '@/components/quick-worklog-widget';
import { OpenWidgetButton } from '@/components/open-widget-button';
import { TaskSuggestionPanel } from '@/components/teams/task-suggestion-panel';
import { Card, EmptyState, PageHeader, PriorityBadge, Stat, StatusBadge, btnGhost, btnPrimary } from '@/components/teams/ui';
import { STATUS_LABEL, WORKLOG_TYPE_LABEL, formatDate } from '@/lib/labels';

export default async function DashboardPage() {
  const ctx = await requireAuth();
  if (hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW_ADMIN)) {
    const [data, people] = await Promise.all([getAdminDashboard(ctx), getAssignablePeople(ctx)]);
    const inProgress = data.byStatus.IN_PROGRESS ?? 0;
    const firstName = ctx.user.name.split(' ')[0] ?? ctx.user.name;
    const overloaded = data.perPerson.filter((p) => p.active >= 4 || p.high >= 2 || p.blocked > 0);

    return (
      <main className="pulso-reveal mx-auto max-w-6xl px-6 py-10 sm:py-12">
        <PageHeader
          kicker="Resumen"
          title={`Hola, ${firstName}`}
          subtitle="Qué está avanzando, qué está bloqueado, qué necesita una decisión."
          actions={
            <>
              <a href="#asignar" className={btnPrimary}>Asignar tarea</a>
              <Link href="/teams" className={btnGhost}>Añadir equipo</Link>
            </>
          }
        />

        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Equipos activos" value={data.teams.length} />
          <Stat label="Tareas en curso" value={inProgress} tone="accent" />
          <Stat label="Bloqueos abiertos" value={data.openBlockers.length} tone={data.openBlockers.length ? 'danger' : 'fg'} />
          <Stat label="Decisiones pendientes" value={data.decisions.length} tone={data.decisions.length ? 'warn' : 'fg'} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card title="Equipos" className="lg:col-span-2" action={<Link href="/teams" className="text-xs text-muted transition hover:text-fg">Ver todos</Link>}>
            <ul className="divide-y divide-border/60">
              {data.teams.map((team) => {
                const blockers = team.tasks.reduce((sum, task) => sum + task.blockers.length, 0) + team.blockers.length;
                const last = team.tasks.flatMap((task) => task.worklogEntries).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
                return (
                  <li key={team.id} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link href={`/teams/${team.id}`} className="font-display text-lg transition hover:text-accent">{team.name}</Link>
                      <p className="truncate text-sm text-muted">{team.focus ?? 'Sin foco definido'}</p>
                      <p className="mt-0.5 truncate text-xs text-muted/80">Último avance: {last?.title ?? 'sin registros recientes'}</p>
                    </div>
                    <div className="font-meta flex shrink-0 items-center gap-3 text-[11px] text-muted">
                      <span>{team.tasks.length} activas</span>
                      <span className={blockers ? 'text-[var(--danger)]' : ''}>{blockers} bloqueos</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div id="asignar">
            <TaskSuggestionPanel teams={data.teams.map((t) => ({ id: t.id, name: t.name }))} people={people} />
          </div>

          <Card title="Necesita atención" className="lg:col-span-2">
            <div className="grid gap-5 md:grid-cols-3">
              <Attention title="Bloqueos" tone="danger" items={data.openBlockers.map((b) => `${b.task?.title ?? b.title}: ${b.description}`)} />
              <Attention title="Decisiones" tone="warn" items={data.decisions.map((d) => `${d.team.name}: ${d.title}`)} />
              <Attention title="Carga a cuidar" tone="info" items={overloaded.map((p) => `${p.user.name}: ${p.active} activas`)} />
            </div>
          </Card>

          <Card title="Resultados recientes">
            {data.recentWorklog.length === 0 ? (
              <EmptyState>Sin avances publicados.</EmptyState>
            ) : (
              <ul className="space-y-3">
                {data.recentWorklog.map((w) => (
                  <li key={w.id}>
                    <p className="truncate text-sm">{w.title}</p>
                    <p className="font-meta text-[11px] text-muted">{w.team?.name ?? w.task?.team.name ?? 'Equipo'} · {w.author.name}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </main>
    );
  }

  const { tasks, agenda, worklog, openBlockers, decisions } = await getMemberDashboard(ctx);
  const firstName = ctx.user.name.split(' ')[0] ?? ctx.user.name;
  return (
    <main className="pulso-reveal mx-auto max-w-5xl px-6 py-10 sm:py-12">
      <PageHeader
        kicker="Mi día"
        title={`Hola, ${firstName}`}
        subtitle="Tus avances, bloqueos y decisiones. Sin vigilancia."
        actions={<OpenWidgetButton />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Mis tareas activas" className="lg:col-span-2">
          {tasks.length === 0 ? (
            <EmptyState>No tenés tareas activas.</EmptyState>
          ) : (
            <ul className="divide-y divide-border/60">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <Link href={`/tasks/${t.id}`} className="min-w-0 truncate text-sm transition hover:text-accent">
                    {t.title}
                    {t.blockers.length > 0 && <span className="font-meta ml-2 text-[10px] uppercase tracking-wide text-[var(--danger)]">bloqueada</span>}
                  </Link>
                  <span className="flex shrink-0 items-center gap-3">
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                    <span className="font-meta text-[11px] text-muted">{formatDate(t.dueDate)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <QuickWorklogWidget taskId={tasks[0]?.id} task={tasks[0] ? { title: tasks[0].title, teamName: tasks[0].team.name } : undefined} />

        <Card title="Mis bloqueos">
          <Attention tone="danger" items={openBlockers.map((b) => `${b.task?.title ?? b.title}: ${b.description}`)} />
        </Card>

        <Card title="Próximo en mi agenda">
          <Attention tone="info" items={agenda.map((e) => `${e.title} · ${formatDate(e.startsAt)}`)} />
        </Card>

        <Card title="Decisiones pendientes">
          <Attention tone="warn" items={decisions.map((d) => `${d.team.name}: ${d.title}`)} />
        </Card>

        <Card title="Bitácora reciente" className="lg:col-span-3">
          {worklog.length === 0 ? (
            <EmptyState>Sin entradas todavía.</EmptyState>
          ) : (
            <ul className="space-y-2.5">
              {worklog.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-meta mr-2 text-[10px] uppercase tracking-wide text-muted">{WORKLOG_TYPE_LABEL[w.type]}</span>
                    {w.title}
                  </span>
                  {w.status === 'DRAFT' ? (
                    <form action={approveWorklogAction}>
                      <input type="hidden" name="worklogId" value={w.id} />
                      <button className="font-meta shrink-0 rounded-full border border-border px-3 py-1 text-[11px] transition hover:border-accent">Aprobar</button>
                    </form>
                  ) : (
                    <span className="font-meta shrink-0 text-[11px] text-[var(--ok)]">aprobada</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}

function Attention({ title, items, tone = 'muted' }: { title?: string; items: string[]; tone?: 'danger' | 'warn' | 'info' | 'muted' }) {
  const dot = { danger: 'var(--danger)', warn: 'var(--warn)', info: 'var(--info)', muted: 'var(--muted)' }[tone];
  return (
    <div>
      {title && <p className="font-meta mb-2 text-[10px] uppercase tracking-[0.18em] text-muted">{title}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-muted/70">Sin pendientes.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {items.slice(0, 5).map((item, i) => (
            <li key={i} className="flex gap-2 text-muted">
              <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
