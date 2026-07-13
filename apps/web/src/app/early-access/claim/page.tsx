import Link from 'next/link';
import { EarlyAccessClaimForm } from '@/components/early-access-claim-form';

export default async function EarlyAccessClaimPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  return (
    <main className="theme-teams flex min-h-screen items-center justify-center bg-bg px-6 text-fg">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-surface/70 p-6">
        <p className="font-meta text-[10px] uppercase tracking-[0.18em] text-accent">Acceso anticipado</p>
        <h1 className="mt-2 font-display text-3xl">Crear cuenta Personal</h1>
        <p className="mb-5 mt-2 text-sm leading-relaxed text-muted">
          Este enlace es personal, vence a los siete días y no abre el registro público general.
        </p>
        <EarlyAccessClaimForm token={token} />
        <Link href="/login" className="mt-5 block text-center text-xs text-accent">Ya tengo una cuenta</Link>
      </section>
    </main>
  );
}
