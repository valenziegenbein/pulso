import Link from 'next/link';
import { PERMISSIONS } from '@pulso/domain';
import type { TaskStatus } from '@pulso/shared';
import { hasPermission, requireAuth } from '@/lib/auth/context';
import { getAdminDashboard } from '@/server/queries';
import { PRIORITY_LABEL, STATUS_LABEL, formatDate } from '@/lib/labels';

const LEVEL_COLOR = {
  ok: 'text-emerald-400',
  warning: 'text-amber-400',
  critical: 'text-red-400',
} as const;

export default async function AdminPage() {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW_ADMIN)) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-sm text-muted">No tenés permiso para ver el panel de administración.</p>
      </main>
    );
  }

  const data = await getAdminDashboard(ctx);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Panel de equipo</h1>
        <p className="text-sm text-muted">Carga, bloqueos, decisiones y trabajo sin definir.</p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sin responsable" value={data.unassigned.length} />
        <Stat label="Sin definición" value={data.withoutDoD.length} />
        <Stat label="Vencidas" value={data.overdue.length} />
        <Stat label="Bloqueos abiertos" value={data.openBlockers.length} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Carga por persona</h2>
          <ul className="space-y-2 text-sm">
            {data.perPerson.map((p) => (
              <li key={p.user.id} className="flex items-center justify-between">
                <span>{p.user.name}</span>
                <span className="flex items-center gap-3 text-xs text-muted">
                  <span>{p.active} activas</span>
                  <span className={LEVEL_COLOR[p.level]}>● {p.level}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Tareas por estado</h2>
          <ul className="space-y-1.5 text-sm">
            {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
              <li key={s} className="flex justify-between">
                <span className="text-muted">{STATUS_LABEL[s]}</span>
                <span>{data.byStatus[s] ?? 0}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Bloqueos activos</h2>
          {data.openBlockers.length === 0 ? (
            <p className="text-sm text-muted">Sin bloqueos. 🎉</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.openBlockers.map((b) => (
                <li key={b.id}>
                  <Link href={`/tasks/${b.taskId}`} className="hover:text-accent">
                    {b.task.title}
                  </Link>
                  <p className="text-xs text-muted">{b.description}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-medium">Necesita atención</h2>
          <div className="space-y-3 text-sm">
            <AttentionList title="Sin responsable" items={data.unassigned.map((t) => t.title)} />
            <AttentionList title="Sin definición de terminado" items={data.withoutDoD.map((t) => t.title)} />
            <AttentionList
              title="Vencidas"
              items={data.overdue.map((t) => `${t.title} (${PRIORITY_LABEL[t.priority]}, vencía ${formatDate(t.dueDate)})`)}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function AttentionList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted">—</p>
      ) : (
        <ul className="mt-1 list-inside list-disc">
          {items.slice(0, 5).map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
