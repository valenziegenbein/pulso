import { requireAuth } from '@/lib/auth/context';
import { getMembersPage, getTeamsPage } from '@/server/queries';
import { Card, Dot, PageHeader } from '@/components/teams/ui';
import { InviteMemberForm } from '@/components/teams/invite-member-form';

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

const STATUS_RANK: Record<string, number> = { Bloqueado: 0, 'Alta carga': 1, 'En foco': 2 };

export default async function MembersPage() {
  const ctx = await requireAuth();
  const [membersRaw, { teams }] = await Promise.all([getMembersPage(ctx), getTeamsPage(ctx)]);

  // Precalculamos estado de carga y ordenamos: lo que necesita atención, primero.
  const members = membersRaw
    .map((member) => {
      const active = member.user.assignedTasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED');
      const high = active.filter((t) => t.priority === 'HIGH').length;
      const blocked = active.filter((t) => t.status === 'BLOCKED' || t.blockers.length > 0).length;
      const status = blocked > 0 ? 'Bloqueado' : active.length >= 4 || high >= 2 ? 'Alta carga' : 'En foco';
      return { member, active: active.length, status };
    })
    .sort((a, b) => STATUS_RANK[a.status]! - STATUS_RANK[b.status]! || b.active - a.active);

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
            {members.map(({ member, active, status }) => {
              const tone = status === 'Bloqueado' ? 'danger' : status === 'Alta carga' ? 'warn' : 'ok';
              const color = { danger: 'var(--danger)', warn: 'var(--warn)', ok: 'var(--ok)' }[tone] as string;
              const teamNames = member.user.teamMemberships.map((tm) => tm.team.name).join(', ') || 'Sin equipo';
              const last =
                member.user.authoredWorklogs[0]?.title ??
                member.user.assignedTasks.flatMap((t) => t.worklogEntries)[0]?.title;
              return (
                <li key={member.id} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium">{member.user.name}</p>
                    <p className="font-meta text-[11px] text-muted">{ROLE_LABEL[member.role.key] ?? member.role.key} · {teamNames}</p>
                    <p className="mt-0.5 truncate text-xs text-muted/80">Último avance: {last ?? 'sin registro reciente'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-meta text-[11px] text-muted">{active} activas</span>
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
          <InviteMemberForm teams={teams} roleOptions={ROLE_OPTIONS} />
        </Card>
      </div>
    </main>
  );
}
