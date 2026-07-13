import {
  approveEarlyAccessAction,
  rejectEarlyAccessAction,
  revokeEarlyAccessAction,
} from '@/server/actions/early-access';
import { requireSuperAdmin } from '@/lib/auth/context';
import { EARLY_ACCESS_STATUS, listEarlyAccessRequests } from '@/server/early-access';
import { Card, PageHeader } from '@/components/teams/ui';

export default async function EarlyAccessAdminPage() {
  await requireSuperAdmin();
  const requests = await listEarlyAccessRequests();
  const counts = Object.fromEntries(Object.values(EARLY_ACCESS_STATUS).map((status) => [status, requests.filter((request) => request.status === status).length]));

  return (
    <main className="pulso-reveal mx-auto max-w-6xl px-6 py-10 sm:py-12">
      <PageHeader
        kicker="Operación interna"
        title="Acceso anticipado"
        subtitle="Aprobaciones globales de Personal AI. Sólo las identidades isSuperAdmin pueden ver o ejecutar acciones en esta pantalla."
      />

      <section className="mb-6 grid gap-3 sm:grid-cols-4">
        {Object.values(EARLY_ACCESS_STATUS).map((status) => (
          <div key={status} className="rounded-xl border border-border bg-surface/60 p-4">
            <p className="font-meta text-[10px] uppercase tracking-[0.16em] text-muted">{statusLabel(status)}</p>
            <p className="mt-1 font-display text-3xl">{counts[status] ?? 0}</p>
          </div>
        ))}
      </section>

      <div className="space-y-5">
        {requests.length === 0 && <Card title="Sin solicitudes"><p className="text-sm text-muted">Las solicitudes de Personal enviadas desde marketing aparecerán acá.</p></Card>}
        {requests.map((request) => (
          <Card key={request.id} title={request.name} className="overflow-hidden">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div className="min-w-0 space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={request.status} />
                  <span className="font-meta text-[10px] uppercase tracking-[0.14em] text-muted">{productLabel(request.product)}</span>
                  <span className="text-xs text-muted">Solicitud #{request.requestCount}</span>
                </div>
                <p className="break-all font-medium">{request.normalizedEmail}</p>
                <p className="whitespace-pre-wrap leading-relaxed text-muted">{request.message}</p>
                <p className="text-xs text-muted">
                  Última solicitud: {formatDate(request.lastRequestedAt)} · consentimiento: {formatDate(request.consentAt)}
                </p>
                {request.user && <p className="text-xs text-[var(--ok)]">Cuenta creada y vinculada{request.user.emailVerifiedAt ? ' · email verificado' : ''}</p>}
                {request.personalOrganization && <p className="text-xs text-muted">Workspace: {request.personalOrganization.name}</p>}
                {request.decisionNote && <p className="text-xs text-muted">Nota interna: {request.decisionNote}</p>}
              </div>

              <div className="w-full shrink-0 space-y-2 lg:w-72">
                {(request.status === EARLY_ACCESS_STATUS.PENDING || request.status === EARLY_ACCESS_STATUS.REJECTED || request.status === EARLY_ACCESS_STATUS.REVOKED) && (
                  <DecisionForm requestId={request.id} action={approveEarlyAccessAction} label="Aprobar y responder" tone="primary" />
                )}
                {request.status === EARLY_ACCESS_STATUS.PENDING && (
                  <DecisionForm requestId={request.id} action={rejectEarlyAccessAction} label="Rechazar y responder" tone="danger" />
                )}
                {request.status === EARLY_ACCESS_STATUS.APPROVED && (
                  <>
                    <DecisionForm requestId={request.id} action={approveEarlyAccessAction} label={request.claimedAt ? 'Reenviar confirmación' : 'Reemitir enlace de alta'} tone="ghost" />
                    <DecisionForm requestId={request.id} action={revokeEarlyAccessAction} label="Revocar acceso" tone="danger" />
                  </>
                )}
              </div>
            </div>

            {request.events.length > 0 && (
              <details className="mt-5 border-t border-border/60 pt-4 text-xs text-muted">
                <summary className="cursor-pointer font-medium text-fg">Historial ({request.events.length} recientes)</summary>
                <ul className="mt-3 space-y-1.5">
                  {request.events.map((event) => (
                    <li key={event.id}>{formatDate(event.createdAt)} · {event.type}{event.actor ? ` · ${event.actor.normalizedEmail}` : ''}</li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        ))}
      </div>
    </main>
  );
}

function DecisionForm({ requestId, action, label, tone }: {
  requestId: string;
  action: (formData: FormData) => Promise<void>;
  label: string;
  tone: 'primary' | 'danger' | 'ghost';
}) {
  const classes = tone === 'primary'
    ? 'bg-accent text-bg'
    : tone === 'danger'
      ? 'border-[var(--danger)]/50 text-[var(--danger)]'
      : 'border-border text-fg';
  return (
    <form action={action} className="space-y-2 rounded-xl border border-border/60 p-3">
      <input type="hidden" name="requestId" value={requestId} />
      <input name="note" maxLength={500} placeholder="Nota interna opcional" className="w-full rounded-lg border border-border bg-bg/40 px-3 py-2 text-xs outline-none focus:border-accent" />
      <button className={`w-full rounded-lg border px-3 py-2 text-xs font-medium transition hover:brightness-110 ${classes}`}>{label}</button>
    </form>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === EARLY_ACCESS_STATUS.APPROVED ? 'var(--ok)' : status === EARLY_ACCESS_STATUS.PENDING ? 'var(--warn)' : 'var(--danger)';
  return <span className="font-meta rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em]" style={{ color: tone, borderColor: `color-mix(in srgb, ${tone} 45%, transparent)` }}>{statusLabel(status)}</span>;
}

function statusLabel(status: string): string {
  return ({ PENDING: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada', REVOKED: 'Revocada' } as Record<string, string>)[status] ?? status;
}

function productLabel(product: string): string {
  return product === 'PERSONAL_LOCAL' ? 'Personal Local / BYOK' : 'Personal AI';
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(value);
}
