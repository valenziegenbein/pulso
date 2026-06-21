import { requireAuth } from '@/lib/auth/context';
import { getTeamsPage } from '@/server/queries';
import { createTeamAction, invitePersonAction } from '@/server/actions/teams';

const ROLE_OPTIONS: Array<[string, string]> = [
  ['MEMBER', 'Miembro'],
  ['COORDINATOR', 'Coordinador'],
  ['TEAM_ADMIN', 'Admin de equipo'],
  ['ORG_ADMIN', 'Admin de organización'],
  ['VIEWER', 'Observador'],
];

export default async function TeamsPage() {
  const ctx = await requireAuth();
  const { teams, members } = await getTeamsPage(ctx);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Equipos y personas</h1>
        <p className="text-sm text-muted">{ctx.organizationName}</p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Equipos */}
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Equipos</h2>
          <ul className="mb-4 space-y-2 text-sm">
            {teams.map((t) => (
              <li key={t.id} className="flex items-center justify-between">
                <span>
                  {t.parent && <span className="text-muted">{t.parent.name} / </span>}
                  {t.name}
                  {t.focus && <span className="block text-xs text-muted">{t.focus}</span>}
                </span>
                <span className="text-xs text-muted">{t._count.tasks} tareas</span>
              </li>
            ))}
          </ul>
          <form action={createTeamAction} className="space-y-2 text-sm">
            <input
              name="name"
              required
              placeholder="Nombre del equipo"
              className="w-full rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent"
            />
            <input
              name="focus"
              placeholder="Foco actual (opcional)"
              className="w-full rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent"
            />
            <select name="parentTeamId" className="w-full rounded-lg border border-border bg-bg p-2">
              <option value="">Equipo de nivel superior</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  Sub-equipo de: {t.name}
                </option>
              ))}
            </select>
            <button className="w-full rounded-lg bg-accent px-3 py-2 font-medium text-bg">Crear equipo</button>
          </form>
        </section>

        {/* Personas */}
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Personas</h2>
          <ul className="mb-4 space-y-2 text-sm">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between">
                <span>
                  {m.user.name}
                  <span className="block text-xs text-muted">{m.user.email}</span>
                </span>
                <span className="text-xs text-muted">{m.role.key}</span>
              </li>
            ))}
          </ul>
          <form action={invitePersonAction} className="space-y-2 text-sm">
            <input
              name="name"
              required
              placeholder="Nombre"
              className="w-full rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent"
            />
            <input
              name="email"
              type="email"
              required
              placeholder="Email"
              className="w-full rounded-lg border border-border bg-bg p-2 outline-none focus:border-accent"
            />
            <select name="roleKey" defaultValue="MEMBER" className="w-full rounded-lg border border-border bg-bg p-2">
              {ROLE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select name="teamId" className="w-full rounded-lg border border-border bg-bg p-2">
              <option value="">Sin equipo</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button className="w-full rounded-lg bg-accent px-3 py-2 font-medium text-bg">Invitar persona</button>
          </form>
        </section>
      </div>
    </main>
  );
}
