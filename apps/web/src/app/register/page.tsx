import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import { getAuthContext } from '@/lib/auth/context';
import { RegisterForm } from '@/components/register-form';

const display = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export default async function RegisterPage() {
  if (await getAuthContext()) redirect('/');

  return (
    <div className={`${display.variable} ${body.variable} ${mono.variable} theme-teams relative min-h-screen overflow-hidden`}>
      <div className="atelier-glow" aria-hidden />
      <div className="atelier-grain" aria-hidden />
      <main className="relative z-10 flex min-h-screen items-center justify-center px-6 py-10">
        <div className="pulso-reveal w-full max-w-sm">
          <div className="mb-7 text-center">
            <div className="flex items-center justify-center gap-2 text-2xl font-semibold">
              <span className="pulso-beat inline-block text-accent">*</span> Pulso
            </div>
            <p className="font-meta mt-2 text-[11px] uppercase tracking-[0.22em] text-muted">Crear organizacion</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface/70 p-6 backdrop-blur-sm">
            <RegisterForm />
          </div>
          <p className="mt-5 text-center text-xs text-muted">
            Ya tenes cuenta?{' '}
            <Link href="/login" className="text-accent transition hover:text-fg">
              Inicia sesion
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
