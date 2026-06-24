import Link from 'next/link';
import { requireAuth } from '@/lib/auth/context';
import { getTeamsPage } from '@/server/queries';
import { createTeamAction } from '@/server/actions/teams';
import { Card, EmptyState, PageHeader, btnPrimary, inputCls, textareaCls } from '@/components/teams/ui';

export default async function TeamsPage() {
  const ctx = await requireAuth();
  const { teams } = await getTeamsPage(ctx);

  return (
    <main className="pulso-reveal mx-auto max-w-6xl px-6 py-10 sm:py-12">
      <PageHeader
        kicker="Organización"
        title="Equipos"
        subtitle="Administrar equipos sin complejidad."
        actions={
          <>
            <a href="#nuevo" className={btnPrimary}>Añadir equipo</a>
            <Link href="/members" className="rounded-full border border-border px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-fg">Miembros</Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {teams.length === 0 ? (
            <EmptyState>Todavía no hay equipos.</EmptyState>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {teams.map((team) => {
                const activeTasks = team.tasks.filter((task) => task.status !== 'DONE' && task.status !== 'CANCELLED');
                const blockers = team.blockers.length + team.tasks.reduce((sum, task) => sum + task.blockers.length, 0);
                const last = team.worklogEntries[0] ?? team.tasks.flatMap((task) => task.worklogEntries)[0];
                return (
                  <Link
                    key={team.id}
                    href={`/teams/${team.id}`}
                    className="group flex flex-col rounded-2xl border border-border bg-surface/60 p-5 transition hover:-translate-y-0.5 hover:border-accent/50"
                  >
                    <h2 className="font-display text-xl transition group-hover:text-accent">{team.name}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{team.focus ?? team.description ?? 'Sin foco definido'}</p>
                    <p className="mt-3 flex-1 truncate text-xs text-muted/80">Último avance: {last?.title ?? 'sin bitácora reciente'}</p>
                    <div className="font-meta mt-4 flex items-center gap-3 border-t border-border/50 pt-3 text-[11px] text-muted">
                      <span>{activeTasks.length} activas</span>
                      <span>·</span>
                      <span className={blockers ? 'text-[var(--danger)]' : ''}>{blockers} bloqueos</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <Card id="nuevo" title="Añadir equipo" className="self-start">
          <form action={createTeamAction} className="space-y-2.5">
            <input name="name" required placeholder="Nombre del equipo" className={inputCls} />
            <input name="focus" placeholder="Foco actual" className={inputCls} />
            <textarea name="description" rows={3} placeholder="Descripción breve" className={textareaCls} />
            <button className="w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-bg transition hover:brightness-110">Crear equipo</button>
          </form>
        </Card>
      </div>
    </main>
  );
}
