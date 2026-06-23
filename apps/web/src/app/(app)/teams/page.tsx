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
        <Card title="Lista de equipos" className="lg:col-span-2">
          {teams.length === 0 ? (
            <EmptyState>Todavía no hay equipos.</EmptyState>
          ) : (
            <ul className="divide-y divide-border/60">
              {teams.map((team) => {
                const activeTasks = team.tasks.filter((task) => task.status !== 'DONE' && task.status !== 'CANCELLED');
                const blockers = team.blockers.length + team.tasks.reduce((sum, task) => sum + task.blockers.length, 0);
                const last = team.worklogEntries[0] ?? team.tasks.flatMap((task) => task.worklogEntries)[0];
                return (
                  <li key={team.id} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link href={`/teams/${team.id}`} className="font-display text-lg transition hover:text-accent">{team.name}</Link>
                      <p className="truncate text-sm text-muted">{team.focus ?? team.description ?? 'Sin foco definido'}</p>
                      <p className="mt-0.5 truncate text-xs text-muted/80">Último avance: {last?.title ?? 'sin bitácora reciente'}</p>
                    </div>
                    <div className="font-meta flex shrink-0 items-center gap-3 text-[11px] text-muted">
                      <span>{activeTasks.length} activas</span>
                      <span className={blockers ? 'text-[var(--danger)]' : ''}>{blockers} bloqueos</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card id="nuevo" title="Añadir equipo">
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
