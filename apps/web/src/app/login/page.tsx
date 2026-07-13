import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import { getAuthContext } from '@/lib/auth/context';
import { LoginForm } from '@/components/login-form';
import { DesktopPersonalLink } from '@/components/desktop-personal-link';
import { DesktopTeamsAuthButton } from '@/components/desktop-teams-auth-button';

const display = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; earlyAccess?: string }> }) {
  if (await getAuthContext()) redirect('/');
  const { returnTo = '', earlyAccess = '' } = await searchParams;

  return (
    <div className={`${display.variable} ${body.variable} ${mono.variable} theme-teams relative min-h-screen overflow-hidden`}>
      <div className="atelier-glow" aria-hidden />
      <div className="atelier-grain" aria-hidden />
      <main className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="pulso-reveal w-full max-w-sm">
          <div className="mb-7 text-center">
            <div className="flex items-center justify-center gap-2 text-2xl font-semibold">
              <span className="pulso-beat inline-block text-accent">*</span> Pulso
            </div>
            <p className="font-meta mt-2 text-[11px] uppercase tracking-[0.22em] text-muted">Organizador interno</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface/70 p-6 backdrop-blur-sm">
            {earlyAccess === 'ready' && (
              <p className="mb-4 rounded-xl border border-[var(--ok)]/40 bg-[var(--ok)]/5 px-3 py-2 text-xs text-[var(--ok)]">
                Cuenta creada. Iniciá sesión y después conectala desde Pulso Desktop.
              </p>
            )}
            <LoginForm returnTo={returnTo} />
            <DesktopTeamsAuthButton />
          </div>
          {process.env.NODE_ENV !== 'production' && (
            <p className="mt-5 text-center text-[11px] leading-relaxed text-muted/80">
              Demo: admin@pulso.local, luis@pulso.local, ana@pulso.local / pulso1234
            </p>
          )}
          <p className="mt-3 text-center text-xs text-muted">
            Nueva organizacion?{' '}
            <Link href="/register" className="text-accent transition hover:text-fg">
              Crear cuenta
            </Link>
          </p>
          <p className="mt-3 text-center text-xs text-muted">
            <Link href="/forgot-password" className="text-accent transition hover:text-fg">
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
          {/* Solo en el desktop: salir del login de Teams y volver a Personal. */}
          <div className="mt-4 text-center">
            <DesktopPersonalLink label="← Volver a Personal" className="text-xs text-muted transition hover:text-fg" />
          </div>
        </div>
      </main>
    </div>
  );
}
