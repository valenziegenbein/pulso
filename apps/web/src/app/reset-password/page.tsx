import Link from 'next/link';
import { ResetPasswordForm } from '@/components/reset-password-form';

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  return (
    <main className="theme-teams flex min-h-screen items-center justify-center bg-bg px-6 text-fg">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-surface/70 p-6">
        <h1 className="text-xl font-semibold">Nueva contraseña</h1>
        <p className="mb-5 mt-2 text-sm text-muted">El enlace es de un solo uso y revoca las sesiones anteriores.</p>
        <ResetPasswordForm token={token} />
        <Link href="/login" className="mt-5 block text-center text-xs text-accent">Volver al login</Link>
      </section>
    </main>
  );
}
