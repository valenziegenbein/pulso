import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/context';
import { getEntitlements } from '@/server/entitlements';
import { canManageBilling, getBillingOverview } from '@/server/billing/service';
import { Card, PageHeader } from '@/components/teams/ui';

export default async function BillingPage() {
  const ctx = await requireAuth();
  if (!await canManageBilling(ctx)) notFound();
  const [subscription, entitlements] = await Promise.all([
    getBillingOverview(ctx),
    getEntitlements(ctx.organizationId),
  ]);

  return (
    <main className="pulso-reveal mx-auto max-w-5xl px-6 py-10 sm:py-12">
      <PageHeader
        kicker="Organización"
        title="Facturación"
        subtitle="Estado de la suscripción, seats y uso administrado. Sólo el owner puede ver esta sección."
      />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title="Suscripción">
          <dl className="space-y-2.5 text-sm">
            <Row label="Plan" value={subscription?.plan.name ?? entitlements.planKey} />
            <Row label="Estado" value={subscription?.status ?? 'LEGACY'} />
            <Row label="Proveedor" value={subscription?.provider ?? 'Sin proveedor'} />
            <Row label="Fin del período" value={formatDate(subscription?.currentPeriodEnd)} />
            <Row label="Cancela al finalizar" value={subscription?.cancelAtPeriodEnd ? 'Sí' : 'No'} />
          </dl>
        </Card>
        <Card title="Uso incluido">
          <dl className="space-y-2.5 text-sm">
            <Row label="Seats" value={`${entitlements.usedSeats}/${entitlements.seatLimit}`} />
            <Row label="Managed AI" value={`${entitlements.managedAiIncludedUnits} unidades`} />
            <Row label="BYOK" value={entitlements.allowByok ? 'Disponible' : 'No disponible'} />
            <Row label="IA local" value={entitlements.allowLocalAi ? 'Disponible' : 'No disponible'} />
          </dl>
        </Card>
        <Card title="Cobros" className="md:col-span-2">
          <p className="text-sm leading-relaxed text-muted">
            El control plane está preparado para checkout, portal y webhooks idempotentes.
            Los cobros permanecen desactivados hasta definir precios, moneda, impuestos,
            reembolsos y configurar un proveedor real.
          </p>
        </Card>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><dt className="text-muted">{label}</dt><dd className="text-right font-medium">{value}</dd></div>;
}

function formatDate(value: Date | null | undefined): string {
  return value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'UTC' }).format(value) : 'No informado';
}
