import { redirect } from 'next/navigation';
import { getSessionIdentity } from '@/lib/auth/context';
import { authorizeDesktopAction } from '@/server/actions/auth';

export default async function DesktopAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{ code_challenge?: string; redirect_uri?: string; state?: string }>;
}) {
  const session = await getSessionIdentity();
  if (!session) redirect('/login');
  const { code_challenge = '', redirect_uri = '', state = '' } = await searchParams;
  return (
    <main className="theme-teams flex min-h-screen items-center justify-center bg-bg px-6 text-fg">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-surface/70 p-6">
        <h1 className="text-xl font-semibold">Conectar Pulso Desktop</h1>
        <p className="mb-5 mt-2 text-sm text-muted">La app recibirá una sesión revocable. No tendrá acceso al filesystem desde Teams.</p>
        <form action={authorizeDesktopAction}>
          <input type="hidden" name="codeChallenge" value={code_challenge} />
          <input type="hidden" name="redirectUri" value={redirect_uri} />
          <input type="hidden" name="state" value={state} />
          <button type="submit" disabled={!code_challenge || !redirect_uri || !state} className="w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-bg disabled:opacity-40">
            Autorizar este dispositivo
          </button>
        </form>
      </section>
    </main>
  );
}
