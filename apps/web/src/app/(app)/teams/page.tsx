import Link from 'next/link';
import { requireAuth } from '@/lib/auth/context';
import { getTeamsPage } from '@/server/queries';
import { createTeamAction } from '@/server/actions/teams';

export default async function TeamsPage() {
  const ctx = await requireAuth();
  const { teams } = await getTeamsPage(ctx);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Equipos</h1>
          <p className="text-sm text-muted">Administrar equipos sin complejidad.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <a href="#nuevo" className="rounded-lg bg-accent px-4 py-2 font-medium text-bg">Añadir equipo</a>
          <Link href="/members" className="rounded-lg border border-border px-4 py-2 hover:border-accent">Miembros</Link>
          <button className="rounded-lg border border-border px-3 py-2 text-muted">...</button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-surface p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium">Lista de equipos</h2>
          {teams.length === 0 ? (
            <p className="text-sm text-muted">Todavia no hay equipos.</p>
          ) : (
            <ul className="divide-y divide-border">
              {teams.map((team) => {
                const activeTasks = team.tasks.filter((task) => task.status !== 'DONE' && task.status !== 'CANCELLED');
                const blockers = team.blockers.length + team.tasks.reduce((sum, task) => sum + task.blockers.length, 0);
                const last = team.worklogEntries[0] ?? team.tasks.flatMap((task) => task.worklogEntries)[0];
                return (
                  <li key={team.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                    <div>
                      <Link href={`/teams/${team.id}`} className="font-medium hover:text-accent">{team.name}</Link>
                      <p className="text-xs text-muted">{team.focus ?? team.description ?? 'Sin foco definido'}</p>
                      <p className="mt-1 text-xs text-muted">Ultimo avance: {last?.title ?? 'sin bitacora reciente'}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                      <span>{activeTasks.length} activas</span>
                      <span>{blockers} bloqueos</span>
                      <Link href={`/teams/${team.id}`} className="rounded border border-border px-2 py-1 hover:border-accent">Ver</Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section id="nuevo" className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Añadir equipo</h2>
          <form action={createTeamAction} className="space-y-2 text-sm">
            <input name="name" required placeholder="Nombre del equipo" className="w-full rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent" />
            <input name="focus" placeholder="Foco actual" className="w-full rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent" />
            <textarea name="description" rows={3} placeholder="Descripcion breve" className="w-full resize-none rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent" />
            <button className="w-full rounded-lg bg-accent px-3 py-2 font-medium text-bg">Crear equipo</button>
          </form>
        </section>
      </div>
    </main>
  );
}
