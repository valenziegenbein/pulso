import { requireAuth, getSessionIdentity } from '@/lib/auth/context';
import { ChangePasswordForm } from '@/components/change-password-form';
import { listActiveSessions } from '@/server/auth-service';
import { revokeSessionAction } from '@/server/actions/auth';

export default async function AccountSecurityPage() {
  const ctx = await requireAuth();
  const current = await getSessionIdentity();
  const sessions = await listActiveSessions(ctx.user.id);
  return (
    <main className="theme-teams min-h-screen bg-bg px-6 py-10 text-fg">
      <div className="mx-auto max-w-2xl space-y-8">
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h1 className="text-2xl font-semibold">Seguridad de la cuenta</h1>
          <p className="mb-5 mt-2 text-sm text-muted">Cambiar la contraseña revoca todas las sesiones.</p>
          <ChangePasswordForm />
        </section>
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold">Sesiones activas</h2>
          <div className="mt-4 space-y-3">
            {sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
                <div>
                  <p className="text-sm">{session.deviceName || 'Dispositivo sin nombre'}{session.id === current?.id ? ' · actual' : ''}</p>
                  <p className="text-xs text-muted">Último acceso: {session.lastSeenAt.toISOString()}</p>
                </div>
                <form action={revokeSessionAction}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <button className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-accent">Revocar</button>
                </form>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
