import Link from 'next/link';
import { AcceptInviteForm } from '@/components/accept-invite-form';

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  return (
    <main className="theme-teams flex min-h-screen items-center justify-center bg-bg px-6 text-fg">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-surface/70 p-6">
        <h1 className="text-xl font-semibold">Invitación a Pulso</h1>
        <p className="mb-5 mt-2 text-sm text-muted">Iniciá sesión con el mismo email que recibió la invitación.</p>
        <AcceptInviteForm token={token} />
        <Link href={`/signup?invite=${encodeURIComponent(token)}`} className="mt-4 block text-center text-xs text-accent">Crear una cuenta para esta invitación</Link>
        <Link href="/login" className="mt-5 block text-center text-xs text-accent">Ir al login</Link>
      </section>
    </main>
  );
}
