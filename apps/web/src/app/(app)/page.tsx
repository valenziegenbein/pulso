import Link from 'next/link';
import { PERMISSIONS } from '@pulso/domain';
import { hasPermission, requireAuth } from '@/lib/auth/context';
import { getAdminDashboard, getAssignablePeople, getMemberDashboard } from '@/server/queries';
import { approveWorklogAction } from '@/server/actions/worklog';
import { resolveDecisionAction } from '@/server/actions/decisions';
import { heuristicPulse, peopleToWatch } from '@/lib/teams/digest';
import { QuickWorklogWidget } from '@/components/quick-worklog-widget';
import { OpenWidgetButton } from '@/components/open-widget-button';
import { TaskSuggestionPanel } from '@/components/teams/task-suggestion-panel';
import { LastVisitBadge } from '@/components/teams/last-visit-badge';
import { PulseText } from '@/components/teams/pulse-text';
import { Card, EmptyState, PageHeader, PriorityBadge, StatusBadge, btnGhost, btnPrimary } from '@/components/teams/ui';
import { WORKLOG_TYPE_LABEL, formatDate } from '@/lib/labels';

export default async function DashboardPage() {
  const ctx = await requireAuth();
  if (hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW_ADMIN)) {
    return AdminDashboard(ctx);
  }
  return MemberDashboard(ctx);
}

// ===================== Vista de líder / CEO =====================
async function AdminDashboard(ctx: Awaited<ReturnType<typeof requireAuth>>) {
  const [data, people] = await Promise.all([getAdminDashboard(ctx), getAssignablePeople(ctx)]);
  const firstName = ctx.user.name.split(' ')[0] ?? ctx.user.name;
  const pulseText = data.recentWorklog.length > 0 ? heuristicPulse(data) : null;
  const watch = peopleToWatch(data.perPerson);

  const activity = [
    ...data.recentWorklog.map((w) => w.createdAt),
    ...data.openBlockers.map((b) => b.createdAt),
    ...data.decisions.map((d) => d.createdAt),
  ].map((d) => new Date(d).toISOString());

  const attention = data.decisions.length + data.openBlockers.length + watch.length;

  return (
    <main className="pulso-reveal mx-auto max-w-5xl px-6 py-10 sm:py-12">
      <PageHeader
        kicker="Resumen"
        title={`Hola, ${firstName}`}
        subtitle="Tu organización en una lectura: qué se movió y qué te espera."
        actions={
          <>
            <a href="#asignar" className={btnPrimary}>Asignar tarea</a>
            <Link href="/teams" className={btnGhost}>Equipos</Link>
          </>
        }
      />

      {/* 1 · PARA LEER — el pulso */}
      {pulseText ? (
        <section className="rounded-2xl border border-accent/25 bg-surface/60 p-6 sm:p-8">
          <p className="font-meta mb-4 text-[11px] uppercase tracking-[0.22em] text-accent">El pulso · esta semana</p>
          <PulseText initial={pulseText} />
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
            <LastVisitBadge activity={activity} />
            <Glance
              items={[
                { n: data.teams.length, label: 'equipos' },
                { n: data.decisions.length, label: data.decisions.length === 1 ? 'decisión' : 'decisiones', tone: data.decisions.length ? 'warn' : undefined },
                { n: data.openBlockers.length, label: data.openBlockers.length === 1 ? 'bloqueo' : 'bloqueos', tone: data.openBlockers.length ? 'danger' : undefined },
                { n: watch.length, label: 'a cuidar', tone: watch.length ? 'info' : undefined },
              ]}
            />
          </div>
        </section>
      ) : (
        <OnboardingHero teamCount={data.teams.length} />
      )}

      {/* 2 · PARA DECIDIR — necesita tu atención */}
      {attention > 0 && (
        <section className="mt-6">
          <h2 className="font-meta mb-4 text-[11px] uppercase tracking-[0.2em] text-muted">Necesita tu atención</h2>
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

      {/* 3 · PARA EXPLORAR — equipos + gestión */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Equipos" className="lg:col-span-2" action={<Link href="/teams" className="text-xs text-muted transition hover:text-fg">Ver todos</Link>}>
          <ul className="divide-y divide-border/60">
            {data.teams.map((team) => {
              const blockers = team.tasks.reduce((sum, t) => sum + t.blockers.length, 0) + team.blockers.length;
              return (
                <li key={team.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/teams/${team.id}`} className="transition hover:text-accent">{team.name}</Link>
                    <p className="truncate text-xs text-muted">{team.focus ?? 'Sin foco definido'}</p>
                  </div>
                  <div className="font-meta flex shrink-0 items-center gap-3 text-[11px] text-muted">
                    <span>{team.tasks.length} activas</span>
                    {blockers > 0 && <span className="text-[var(--danger)]">{blockers} bloqueos</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <div id="asignar">
          <TaskSuggestionPanel teams={data.teams.map((t) => ({ id: t.id, name: t.name }))} people={people} />
        </div>
      </div>
    </main>
  );
}

function Glance({ items }: { items: Array<{ n: number; label: string; tone?: 'warn' | 'danger' | 'info' }> }) {
  const color = (t?: string) => (t ? `var(--${t})` : 'var(--fg)');
  return (
    <p className="font-meta flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
      {items.map((it, i) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-muted/40">·</span>}
          <span style={{ color: color(it.tone) }}>{it.n}</span> {it.label}
        </span>
      ))}
    </p>
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
      <p className="font-meta mb-3 text-[10px] uppercase tracking-[0.16em] text-muted">Decisiones que te esperan</p>
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
                        Ver →
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

function OnboardingHero({ teamCount }: { teamCount: number }) {
  const steps: Array<{ n: string; title: string; desc: string; href: string; cta: string }> = [
    { n: '01', title: 'Armá tus equipos', desc: 'Agrupá el trabajo por área o proyecto.', href: '/teams', cta: 'Crear equipo' },
    { n: '02', title: 'Sumá personas', desc: 'Invitá a tu equipo. Cada quien decide qué registra.', href: '/members', cta: 'Añadir miembro' },
    { n: '03', title: 'Asigná la primera tarea', desc: 'Escribila o dejá que la IA la proponga; vos aprobás.', href: '/tasks#ia', cta: 'Asignar con IA' },
  ];
  return (
    <section className="rounded-2xl border border-accent/25 bg-surface/60 p-6 sm:p-8">
      <p className="font-meta mb-3 text-[11px] uppercase tracking-[0.22em] text-accent">Bienvenida a Pulso</p>
      <h2 className="font-display text-3xl leading-tight sm:text-4xl">El pulso de tu equipo, en una lectura.</h2>
      <p className="mt-3 max-w-xl text-muted">
        Pulso convierte el trabajo de tu gente en un resumen que leés en 30 segundos. Sin vigilancia: cada persona elige qué registra, la IA propone y vos aprobás.
        {teamCount > 0 ? ' Apenas tu equipo capture avances, vas a leer su pulso acá.' : ''}
      </p>
      <ol className="mt-7 grid gap-4 sm:grid-cols-3">
        {steps.map((s) => (
          <li key={s.n} className="rounded-2xl border border-border bg-bg/40 p-4">
            <span className="font-meta text-[11px] text-accent">{s.n}</span>
            <h3 className="font-display mt-1 text-lg">{s.title}</h3>
            <p className="mt-1 text-sm text-muted">{s.desc}</p>
            <Link href={s.href} className="font-meta mt-3 inline-block text-[11px] uppercase tracking-wide text-accent transition hover:text-fg">
              {s.cta} →
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ===================== Vista de miembro =====================
async function MemberDashboard(ctx: Awaited<ReturnType<typeof requireAuth>>) {
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
