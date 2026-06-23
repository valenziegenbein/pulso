import Link from 'next/link';
import { PERMISSIONS } from '@pulso/domain';
import { hasPermission, requireAuth } from '@/lib/auth/context';
import { getAdminDashboard } from '@/server/queries';
import { Card, PageHeader } from '@/components/teams/ui';

export default async function AdminPage() {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW_ADMIN)) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-sm text-muted">No tenés permiso para ver administración.</p>
      </main>
    );
  }

  const data = await getAdminDashboard(ctx);

  return (
    <main className="pulso-reveal mx-auto max-w-5xl px-6 py-10 sm:py-12">
      <PageHeader
        kicker="Organización"
        title="Admin"
        subtitle="Controles básicos del modo Teams. Sin vigilancia ni automatismos invasivos."
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title="Organización">
          <dl className="space-y-2.5 text-sm">
            <Row label="Nombre" value={ctx.organizationName} />
            <Row label="Equipos" value={data.teams.length} />
            <Row label="Miembros" value={data.perPerson.length} />
          </dl>
        </Card>

        <Card title="Privacidad">
          <ul className="space-y-2 text-sm text-muted">
            <li className="flex gap-2"><span className="text-[var(--ok)]">✓</span> No se mide mouse, teclado ni tiempo activo.</li>
            <li className="flex gap-2"><span className="text-[var(--ok)]">✓</span> No hay capturas automáticas.</li>
            <li className="flex gap-2"><span className="text-[var(--ok)]">✓</span> La IA propone; una persona aprueba.</li>
          </ul>
        </Card>

        <Card title="Accesos rápidos">
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/teams" className="rounded-full border border-border px-4 py-2 text-muted transition hover:border-accent hover:text-fg">Equipos</Link>
            <Link href="/members" className="rounded-full border border-border px-4 py-2 text-muted transition hover:border-accent hover:text-fg">Miembros</Link>
            <Link href="/tasks#ia" className="rounded-full bg-accent px-4 py-2 font-medium text-bg transition hover:brightness-110">Asignar con IA</Link>
          </div>
        </Card>

        <Card title="Pendientes abiertos">
          <dl className="space-y-2.5 text-sm">
            <Row label="Bloqueos" value={data.openBlockers.length} tone={data.openBlockers.length ? 'var(--danger)' : undefined} />
            <Row label="Decisiones" value={data.decisions.length} tone={data.decisions.length ? 'var(--warn)' : undefined} />
            <Row label="Tareas sin responsable" value={data.unassigned.length} tone={data.unassigned.length ? 'var(--warn)' : undefined} />
          </dl>
        </Card>
      </div>
    </main>
  );
}

function Row({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium" style={tone ? { color: tone } : undefined}>{value}</dd>
    </div>
  );
}
