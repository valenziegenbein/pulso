import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/context';
import { getEntitlements } from '@/server/entitlements';
import { canManageBilling, getBillingOverview } from '@/server/billing/service';
import { COMMERCIAL_OFFERS, priceVersionFromEnvironment, quoteLaunchOffer, type CommercialOfferId } from '@/server/billing/catalog';
import { isBillingCheckoutReady } from '@/server/billing/config';
import { createBillingCheckoutAction } from '@/server/actions/billing';
import { Card, PageHeader } from '@/components/teams/ui';

export default async function BillingPage() {
  const ctx = await requireAuth();
  if (!await canManageBilling(ctx)) notFound();
  const [subscription, entitlements] = await Promise.all([
    getBillingOverview(ctx),
    getEntitlements(ctx.organizationId),
  ]);
  const checkoutReady = isBillingCheckoutReady();
  const quotes = commercialQuotes();

  return (
    <main className="pulso-reveal mx-auto max-w-5xl px-6 py-10 sm:py-12">
      <PageHeader
        kicker="Organización"
        title="Facturación"
        subtitle="Estado de la suscripción, integrantes y uso administrado. Sólo el owner puede ver esta sección."
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
            <Row label="Integrantes" value={`${entitlements.usedSeats}/${entitlements.seatLimit}`} />
            <Row label="Managed AI" value={`${entitlements.managedAiIncludedUnits} unidades`} />
            <Row label="BYOK" value={entitlements.allowByok ? 'Disponible' : 'No disponible'} />
            <Row label="IA local" value={entitlements.allowLocalAi ? 'Disponible' : 'No disponible'} />
          </dl>
        </Card>
        <Card title="Planes de lanzamiento" className="md:col-span-2">
          {quotes.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {quotes.map((quote) => (
                <div key={quote.offerId} className="rounded-2xl border border-border bg-surface-2 p-4">
                  <p className="text-sm font-semibold">{offerName(quote.offerId)}</p>
                  <p className="mt-1 text-xs text-muted">{quote.seats} integrantes</p>
                  <p className="mt-4 text-xs text-muted line-through decoration-red-500">{formatArs(quote.listArsCentavos)}/mes</p>
                  <p className="text-xl font-semibold">{formatArs(quote.launchArsCentavos)}<span className="text-xs font-normal text-muted">/mes</span></p>
                  <p className="mt-1 text-xs text-muted">25% de lanzamiento durante 12 meses</p>
                  {checkoutReady && !subscription?.providerSubscriptionId ? (
                    <form action={createBillingCheckoutAction} className="mt-4">
                      <input type="hidden" name="offerId" value={quote.offerId} />
                      <button type="submit" className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                        Continuar con Mercado Pago
                      </button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted">La tabla ARS está cerrada hasta publicar una versión de precios vigente.</p>
          )}
          <p className="mt-4 text-xs leading-relaxed text-muted">
            {checkoutReady
              ? 'Checkout sandbox habilitado. Mercado Pago mostrará el detalle antes de autorizar.'
              : 'Los cobros permanecen cerrados; producción continúa usando el proveedor mock.'}
          </p>
        </Card>
      </div>
    </main>
  );
}

function commercialQuotes() {
  try {
    const version = priceVersionFromEnvironment();
    return (Object.keys(COMMERCIAL_OFFERS) as CommercialOfferId[]).map((offerId) => quoteLaunchOffer(offerId, version));
  } catch {
    return [];
  }
}

function offerName(offerId: CommercialOfferId): string {
  if (offerId === 'teams-5') return 'Teams 5';
  if (offerId === 'teams-10') return 'Teams 10';
  return 'Business 50';
}

function formatArs(centavos: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(centavos / 100);
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><dt className="text-muted">{label}</dt><dd className="text-right font-medium">{value}</dd></div>;
}

function formatDate(value: Date | null | undefined): string {
  return value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeZone: 'UTC' }).format(value) : 'No informado';
}
