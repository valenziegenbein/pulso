import Link from 'next/link';
import { PERMISSIONS } from '@pulso/domain';
import { hasPermission, requireAuth } from '@/lib/auth/context';
import { getAdminDashboard } from '@/server/queries';

export default async function AdminPage() {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW_ADMIN)) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-sm text-muted">No tenes permiso para ver administracion.</p>
      </main>
    );
  }

  const data = await getAdminDashboard(ctx);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted">Controles basicos del modo Teams. Sin vigilancia ni automatismos invasivos.</p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Organizacion</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Nombre</dt><dd>{ctx.organizationName}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Equipos</dt><dd>{data.teams.length}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Miembros</dt><dd>{data.perPerson.length}</dd></div>
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Privacidad</h2>
          <ul className="space-y-2 text-sm text-muted">
            <li>No se mide mouse, teclado ni tiempo activo.</li>
            <li>No hay capturas automaticas.</li>
            <li>La IA propone; una persona aprueba.</li>
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Accesos rapidos</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/teams" className="rounded-lg border border-border px-3 py-2 hover:border-accent">Equipos</Link>
            <Link href="/members" className="rounded-lg border border-border px-3 py-2 hover:border-accent">Miembros</Link>
            <Link href="/tasks#ia" className="rounded-lg bg-accent px-3 py-2 font-medium text-bg">Asignar con IA</Link>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Pendientes abiertos</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Bloqueos</dt><dd>{data.openBlockers.length}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Decisiones</dt><dd>{data.decisions.length}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Tareas sin responsable</dt><dd>{data.unassigned.length}</dd></div>
          </dl>
        </section>
      </div>
    </main>
  );
}
