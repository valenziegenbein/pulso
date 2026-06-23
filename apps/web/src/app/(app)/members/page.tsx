import { requireAuth } from '@/lib/auth/context';
import { getMembersPage, getTeamsPage } from '@/server/queries';
import { invitePersonAction } from '@/server/actions/teams';

const ROLE_OPTIONS = [
  ['MEMBER', 'Miembro'],
  ['TEAM_ADMIN', 'Admin de equipo'],
  ['ORG_ADMIN', 'Admin de organizacion'],
] as const;

export default async function MembersPage() {
  const ctx = await requireAuth();
  const [members, { teams }] = await Promise.all([getMembersPage(ctx), getTeamsPage(ctx)]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Miembros</h1>
          <p className="text-sm text-muted">Personas, equipo y carga visible de trabajo.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <a href="#nuevo" className="rounded-lg bg-accent px-4 py-2 font-medium text-bg">Añadir miembro</a>
          <button className="rounded-lg border border-border px-4 py-2 hover:border-accent">Editar rol</button>
          <button className="rounded-lg border border-border px-3 py-2 text-muted">...</button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-surface p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium">Lista</h2>
          <ul className="divide-y divide-border">
            {members.map((member) => {
              const active = member.user.assignedTasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED');
              const high = active.filter((t) => t.priority === 'HIGH').length;
              const blocked = active.filter((t) => t.status === 'BLOCKED' || t.blockers.length > 0).length;
              const status = blocked > 0 ? 'Bloqueado' : active.length >= 4 || high >= 2 ? 'Alta carga' : 'En foco';
              const teamNames = member.user.teamMemberships.map((tm) => tm.team.name).join(', ') || 'Sin equipo';
              const last = member.user.authoredWorklogs[0]?.title ?? active.flatMap((t) => t.worklogEntries)[0]?.title;
              return (
                <li key={member.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{member.user.name}</p>
                    <p className="text-xs text-muted">{member.role.key} · {teamNames}</p>
                    <p className="mt-1 text-xs text-muted">Ultimo avance: {last ?? 'sin registro reciente'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                    <span>{active.length} activas</span>
                    <span className={status === 'Bloqueado' ? 'text-red-400' : status === 'Alta carga' ? 'text-amber-400' : 'text-emerald-400'}>{status}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section id="nuevo" className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Añadir miembro</h2>
          <form action={invitePersonAction} className="space-y-2 text-sm">
            <input name="name" required placeholder="Nombre" className="w-full rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent" />
            <input name="email" type="email" required placeholder="Email" className="w-full rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent" />
            <select name="roleKey" defaultValue="MEMBER" className="w-full rounded-lg border border-border bg-bg p-2">
              {ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select name="teamId" className="w-full rounded-lg border border-border bg-bg p-2">
              <option value="">Sin equipo</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
            <button className="w-full rounded-lg bg-accent px-3 py-2 font-medium text-bg">Añadir miembro</button>
          </form>
        </section>
      </div>
    </main>
  );
}
