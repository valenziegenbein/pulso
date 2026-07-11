import Link from 'next/link';
import { requireAuth } from '@/lib/auth/context';
import { getAdminDashboard, getAssignablePeople, getMemberDashboard } from '@/server/queries';
import { resolveDecisionAction } from '@/server/actions/decisions';
import { heuristicPulse, peopleToWatch } from '@/lib/teams/digest';
import { QuickWorklogWidget } from '@/components/quick-worklog-widget';
import { OpenWidgetButton } from '@/components/open-widget-button';
import { TaskSuggestionPanel } from '@/components/teams/task-suggestion-panel';
import { Card, EmptyState, PageHeader, PriorityBadge, StatusBadge, btnGhost, btnPrimary } from '@/components/teams/ui';
import { formatDate } from '@/lib/labels';

type Auth = Awaited<ReturnType<typeof requireAuth>>;

export default async function DashboardPage() {
  const ctx = await requireAuth();
  if (ctx.role === 'ORG_ADMIN' || ctx.role === 'SUPER_ADMIN') {
    return AdminDashboard(ctx);
  }
  return MemberDashboard(ctx);
}

async function AdminDashboard(ctx: Auth) {
  const [data, people] = await Promise.all([getAdminDashboard(ctx), getAssignablePeople(ctx)]);
  const firstName = ctx.user.name.split(' ')[0] ?? ctx.user.name;
  const pulseText = heuristicPulse(data);
  const watch = peopleToWatch(data.perPerson);
  const activeTaskCount =
    (data.byStatus.TODO ?? 0) +
    (data.byStatus.IN_PROGRESS ?? 0) +
    (data.byStatus.BLOCKED ?? 0) +
    (data.byStatus.IN_REVIEW ?? 0);

  return (
    <main className="pulso-reveal mx-auto max-w-5xl px-6 py-10 sm:py-12">
      <PageHeader
        kicker="Resumen"
        title={`Hola, ${firstName}`}
        subtitle="Que esta avanzando, que esta bloqueado, que necesita decision."
        actions={
          <>
            <a href="#asignar" className={btnPrimary}>Asignar tarea</a>
            <Link href="/teams" className={btnGhost}>Anadir equipo</Link>
          </>
        }
      />

      <section className="rounded-2xl border border-accent/25 bg-surface/60 p-6 sm:p-8">
        <p className="font-meta mb-3 text-[11px] uppercase tracking-[0.22em] text-accent">Pulso de la organizacion</p>
        <p className="max-w-3xl text-lg leading-relaxed text-fg/90">{pulseText}</p>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Equipos activos" value={data.teams.length} />
        <StatCard label="Tareas en curso" value={activeTaskCount} />
        <StatCard label="Bloqueos abiertos" value={data.openBlockers.length} tone={data.openBlockers.length ? 'danger' : undefined} />
        <StatCard label="Decisiones pendientes" value={data.decisions.length} tone={data.decisions.length ? 'warn' : undefined} />
      </section>

      {(data.openBlockers.length > 0 || data.decisions.length > 0 || watch.length > 0) && (
        <section className="mt-6">
          <h2 className="font-meta mb-4 text-[11px] uppercase tracking-[0.2em] text-muted">Necesita tu atencion</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <DecisionInbox decisions={data.decisions} />
            <AttentionCol
              title="Bloqueos abiertos"
              tone="danger"
              empty="Sin bloqueos."
              items={data.openBlockers.map((b) => ({
                label: b.title,
                meta: b.task?.team?.name ?? b.team?.name ?? '',
                href: b.task ? `/tasks/${b.task.id}` : undefined,
              }))}
            />
            <AttentionCol
              title="Carga a cuidar"
              tone="info"
              empty="Cargas equilibradas."
              items={watch.map((p) => ({ label: p.user.name, meta: `${p.active} activas`, href: '/members' }))}
            />
          </div>
        </section>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Equipos" className="lg:col-span-2" action={<Link href="/teams" className="text-xs text-muted transition hover:text-fg">Ver todos</Link>}>
          {data.teams.length === 0 ? (
            <EmptyState>Todavia no hay equipos.</EmptyState>
          ) : (
            <ul className="divide-y divide-border/60">
              {data.teams.map((team) => {
                const blockers = team.tasks.reduce((sum, t) => sum + t.blockers.length, 0) + team.blockers.length;
                const last = team.tasks.flatMap((t) => t.worklogEntries)[0]?.title ?? 'Sin avances recientes';
                return (
                  <li key={team.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link href={`/teams/${team.id}`} className="transition hover:text-accent">{team.name}</Link>
                      <p className="truncate text-xs text-muted">{team.focus ?? last}</p>
                    </div>
                    <div className="font-meta flex shrink-0 items-center gap-3 text-[11px] text-muted">
                      <span>{team.tasks.length} activas</span>
                      {blockers > 0 && <span className="text-[var(--danger)]">{blockers} bloqueos</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div id="asignar">
          <TaskSuggestionPanel teams={data.teams.map((t) => ({ id: t.id, name: t.name }))} people={people} />
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'danger' | 'info' }) {
  const color = tone ? `var(--${tone})` : 'var(--fg)';
  return (
    <div className="rounded-2xl border border-border bg-surface/50 p-4">
      <p className="font-meta text-[10px] uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="font-display mt-2 text-3xl" style={{ color }}>{value}</p>
    </div>
  );
}

function AttentionCol({
  title,
  tone,
  items,
  empty,
}: {
  title: string;
  tone: 'warn' | 'danger' | 'info';
  items: Array<{ label: string; meta?: string; href?: string }>;
  empty: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface/50 p-4">
      <p className="font-meta mb-3 text-[10px] uppercase tracking-[0.16em] text-muted">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted/60">{empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {items.slice(0, 4).map((it, i) => {
            const body = (
              <span className="flex gap-2">
                <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `var(--${tone})` }} />
                <span className="min-w-0">
                  <span className="block text-sm leading-snug">{it.label}</span>
                  {it.meta && <span className="font-meta text-[10px] uppercase tracking-wide text-muted/70">{it.meta}</span>}
                </span>
              </span>
            );
            return (
              <li key={i}>
                {it.href ? (
                  <Link href={it.href} className="block transition hover:text-accent">{body}</Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DecisionInbox({
  decisions,
}: {
  decisions: Array<{ id: string; title: string; context: string; team: { id: string; name: string }; task: { id: string } | null }>;
}) {
  return (
    <div className="rounded-2xl border border-[var(--warn)]/30 bg-surface/50 p-4">
      <p className="font-meta mb-3 text-[10px] uppercase tracking-[0.16em] text-muted">Decisiones que esperan</p>
      {decisions.length === 0 ? (
        <p className="text-sm text-muted/60">Nada para decidir.</p>
      ) : (
        <ul className="space-y-3">
          {decisions.slice(0, 4).map((d) => (
            <li key={d.id} className="border-b border-border/40 pb-3 last:border-0 last:pb-0">
              <div className="flex gap-2">
                <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--warn)' }} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">{d.title}</p>
                  <p className="font-meta text-[10px] uppercase tracking-wide text-muted/70">{d.team.name}</p>
                  {d.context && <p className="mt-1 line-clamp-2 text-xs text-muted">{d.context}</p>}
                  <div className="mt-2 flex items-center gap-3">
                    <form action={resolveDecisionAction}>
                      <input type="hidden" name="decisionId" value={d.id} />
                      <button className="font-meta rounded-full bg-accent px-3 py-1 text-[11px] font-medium text-bg transition hover:brightness-110">
                        Marcar resuelta
                      </button>
                    </form>
                    {d.task && (
                      <Link href={`/tasks/${d.task.id}`} className="font-meta text-[11px] uppercase tracking-wide text-muted transition hover:text-fg">
                        Ver
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function MemberDashboard(ctx: Auth) {
  const { tasks, worklog, openBlockers, decisions } = await getMemberDashboard(ctx);
  const firstName = ctx.user.name.split(' ')[0] ?? ctx.user.name;
  const approvedWorklog = worklog.filter((w) => w.status === 'PUBLISHED');

  return (
    <main className="pulso-reveal mx-auto max-w-5xl px-6 py-10 sm:py-12">
      <PageHeader
        kicker="Mi trabajo"
        title={`Hola, ${firstName}`}
        subtitle="Web queda para leer y resolver lo justo. Para capturar avances sin cortar el flujo, usa Pulso Desktop."
        actions={<OpenWidgetButton />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Mis tareas" className="lg:col-span-2">
          {tasks.length === 0 ? (
            <EmptyState>No tenes tareas activas.</EmptyState>
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

        <Card title="Mis decisiones pendientes">
          <Attention tone="warn" items={decisions.map((d) => `${d.team.name}: ${d.title}`)} />
        </Card>

        <Card title="Pulso Desktop">
          <p className="mb-4 text-sm leading-relaxed text-muted">
            El widget flotante, capturas manuales y aprobacion cotidiana viven en Desktop. La web es el panel de control.
          </p>
          <OpenWidgetButton />
        </Card>

        <Card title="Mis avances aprobados" className="lg:col-span-3">
          {approvedWorklog.length === 0 ? (
            <EmptyState>Sin avances aprobados todavia.</EmptyState>
          ) : (
            <ul className="space-y-2.5">
              {approvedWorklog.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg/40 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{w.title}</span>
                  <span className="font-meta shrink-0 text-[11px] text-[var(--ok)]">aprobada</span>
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
