import { requireAuth } from '@/lib/auth/context';
import { getMembersPage, getTeamsPage } from '@/server/queries';
import { invitePersonAction } from '@/server/actions/teams';
import { Card, Dot, PageHeader, inputCls, selectCls } from '@/components/teams/ui';

const ROLE_OPTIONS = [
  ['MEMBER', 'Miembro'],
  ['TEAM_ADMIN', 'Admin de equipo'],
  ['ORG_ADMIN', 'Admin de organización'],
] as const;

const ROLE_LABEL: Record<string, string> = {
  MEMBER: 'Miembro',
  TEAM_ADMIN: 'Admin de equipo',
  ORG_ADMIN: 'Admin de organización',
};

export default async function MembersPage() {
  const ctx = await requireAuth();
  const [members, { teams }] = await Promise.all([getMembersPage(ctx), getTeamsPage(ctx)]);

  return (
    <main className="pulso-reveal mx-auto max-w-6xl px-6 py-10 sm:py-12">
      <PageHeader
        kicker="Personas"
        title="Miembros"
        subtitle="Equipo y carga de trabajo, visible y sin vigilancia."
        actions={<a href="#nuevo" className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition hover:brightness-110">Añadir miembro</a>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Personas" className="lg:col-span-2">
          <ul className="divide-y divide-border/60">
            {members.map((member) => {
              const active = member.user.assignedTasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED');
              const high = active.filter((t) => t.priority === 'HIGH').length;
              const blocked = active.filter((t) => t.status === 'BLOCKED' || t.blockers.length > 0).length;
              const status = blocked > 0 ? 'Bloqueado' : active.length >= 4 || high >= 2 ? 'Alta carga' : 'En foco';
              const tone = status === 'Bloqueado' ? 'danger' : status === 'Alta carga' ? 'warn' : 'ok';
              const color = { danger: 'var(--danger)', warn: 'var(--warn)', ok: 'var(--ok)' }[tone] as string;
              const teamNames = member.user.teamMemberships.map((tm) => tm.team.name).join(', ') || 'Sin equipo';
              const last = member.user.authoredWorklogs[0]?.title ?? active.flatMap((t) => t.worklogEntries)[0]?.title;
              return (
                <li key={member.id} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium">{member.user.name}</p>
                    <p className="font-meta text-[11px] text-muted">{ROLE_LABEL[member.role.key] ?? member.role.key} · {teamNames}</p>
                    <p className="mt-0.5 truncate text-xs text-muted/80">Último avance: {last ?? 'sin registro reciente'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-meta text-[11px] text-muted">{active.length} activas</span>
                    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color }}>
                      <Dot tone={tone} />
                      {status}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card id="nuevo" title="Añadir miembro">
          <form action={invitePersonAction} className="space-y-2.5">
            <input name="name" required placeholder="Nombre" className={inputCls} />
            <input name="email" type="email" required placeholder="Email" className={inputCls} />
            <select name="roleKey" defaultValue="MEMBER" className={selectCls}>
              {ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select name="teamId" className={selectCls}>
              <option value="">Sin equipo</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
            <button className="w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-bg transition hover:brightness-110">Añadir miembro</button>
          </form>
        </Card>
      </div>
    </main>
  );
}
