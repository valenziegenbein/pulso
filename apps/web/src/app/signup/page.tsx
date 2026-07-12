import Link from 'next/link';
import { InviteSignupForm } from '@/components/invite-signup-form';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite = '' } = await searchParams;
  return (
    <main className="theme-teams flex min-h-screen items-center justify-center bg-bg px-6 text-fg">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-surface/70 p-6">
        <h1 className="text-xl font-semibold">Crear cuenta invitada</h1>
        <p className="mb-5 mt-2 text-sm text-muted">El alta sólo funciona con una invitación vigente. El registro público general permanece cerrado.</p>
        <InviteSignupForm token={invite} />
        <Link href="/login" className="mt-5 block text-center text-xs text-accent">Ya tengo cuenta</Link>
      </section>
    </main>
  );
}
