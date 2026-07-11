import Link from 'next/link';
import { LLM_PROVIDER_TYPE, PLAN_SEAT_LIMIT } from '@pulso/shared';
import { requireAuth } from '@/lib/auth/context';
import { configureOrganizationLLMAction } from '@/server/actions/admin';
import { getAdminDashboard, getOrganizationSettings } from '@/server/queries';
import { Card, PageHeader, inputCls, selectCls } from '@/components/teams/ui';

export default async function AdminPage() {
  const ctx = await requireAuth();
  if (ctx.role !== 'ORG_ADMIN' && ctx.role !== 'SUPER_ADMIN') {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-sm text-muted">No tenes permiso para ver administracion.</p>
      </main>
    );
  }

  const [data, settings] = await Promise.all([getAdminDashboard(ctx), getOrganizationSettings(ctx)]);
  const seatsLeft = Math.max(0, settings.seatLimit - settings.usedSeats);

  return (
    <main className="pulso-reveal mx-auto max-w-5xl px-6 py-10 sm:py-12">
      <PageHeader
        kicker="Organizacion"
        title="Admin"
        subtitle="Panel de control para coordinar trabajo, administrar seats y configurar IA sin vigilancia."
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title="Organizacion">
          <dl className="space-y-2.5 text-sm">
            <Row label="Nombre" value={ctx.organizationName} />
            <Row label="Equipos" value={data.teams.length} />
            <Row label="Miembros" value={data.perPerson.length} />
          </dl>
        </Card>

        <Card title="Plan y seats">
          <dl className="space-y-2.5 text-sm">
            <Row label="Plan" value={settings.planKey} />
            <Row label="Seats usados" value={`${settings.usedSeats}/${settings.seatLimit}`} />
            <Row label="Disponibles" value={seatsLeft} tone={seatsLeft === 0 ? 'var(--warn)' : undefined} />
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Billing real proximamente. Por ahora los planes solo controlan seats:
            FREE {PLAN_SEAT_LIMIT.FREE}, TEAM {PLAN_SEAT_LIMIT.TEAM}, BUSINESS {PLAN_SEAT_LIMIT.BUSINESS}.
          </p>
        </Card>

        <Card title="Privacidad">
          <ul className="space-y-2 text-sm text-muted">
            <li className="flex gap-2"><span className="text-[var(--ok)]">ok</span> No se mide mouse, teclado ni tiempo activo.</li>
            <li className="flex gap-2"><span className="text-[var(--ok)]">ok</span> No hay capturas automaticas.</li>
            <li className="flex gap-2"><span className="text-[var(--ok)]">ok</span> La IA propone; una persona aprueba.</li>
          </ul>
        </Card>

        <Card title="Pendientes abiertos">
          <dl className="space-y-2.5 text-sm">
            <Row label="Bloqueos" value={data.openBlockers.length} tone={data.openBlockers.length ? 'var(--danger)' : undefined} />
            <Row label="Decisiones" value={data.decisions.length} tone={data.decisions.length ? 'var(--warn)' : undefined} />
            <Row label="Tareas sin responsable" value={data.unassigned.length} tone={data.unassigned.length ? 'var(--warn)' : undefined} />
          </dl>
        </Card>

        <Card title="Accesos rapidos">
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/teams" className="rounded-full border border-border px-4 py-2 text-muted transition hover:border-accent hover:text-fg">Equipos</Link>
            <Link href="/members" className="rounded-full border border-border px-4 py-2 text-muted transition hover:border-accent hover:text-fg">Miembros</Link>
            <Link href="/tasks#ia" className="rounded-full bg-accent px-4 py-2 font-medium text-bg transition hover:brightness-110">Asignar con IA</Link>
          </div>
        </Card>

        <Card title="IA de la organizacion" className="md:col-span-2">
          <form action={configureOrganizationLLMAction} className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="font-meta text-[10px] uppercase tracking-[0.16em] text-muted">Provider</span>
              <select name="providerType" defaultValue={settings.llm?.providerType ?? 'MOCK'} className={selectCls}>
                {LLM_PROVIDER_TYPE.map((provider) => (
                  <option key={provider} value={provider}>{provider}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-meta text-[10px] uppercase tracking-[0.16em] text-muted">Modelo</span>
              <input name="model" defaultValue={settings.llm?.model ?? 'mock-1'} placeholder="gpt-4o-mini / llama..." className={inputCls} />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="font-meta text-[10px] uppercase tracking-[0.16em] text-muted">Base URL</span>
              <input name="baseUrl" defaultValue={settings.llm?.baseUrl ?? ''} placeholder="http://host.docker.internal:1234/v1" className={inputCls} />
              <span className="block text-[11px] text-muted/80">Debe ser alcanzable desde el servidor. No se autodetecta localhost.</span>
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="font-meta text-[10px] uppercase tracking-[0.16em] text-muted">API key</span>
              <input
                name="apiKey"
                type="password"
                placeholder={settings.llm?.hasApiKey ? 'Ya hay una key guardada; dejalo vacio para conservarla' : 'Opcional para LM Studio / requerida para cloud'}
                className={inputCls}
              />
            </label>
            <button className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-bg transition hover:brightness-110 md:w-fit">
              Guardar IA
            </button>
          </form>
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
