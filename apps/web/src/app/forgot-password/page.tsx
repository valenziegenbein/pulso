import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <main className="theme-teams flex min-h-screen items-center justify-center bg-bg px-6 text-fg">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-surface/70 p-6">
        <h1 className="text-xl font-semibold">Recuperar acceso</h1>
        <p className="mb-5 mt-2 text-sm text-muted">La respuesta no revela si el email está registrado.</p>
        <ForgotPasswordForm />
        <Link href="/login" className="mt-5 block text-center text-xs text-accent">Volver al login</Link>
      </section>
    </main>
  );
}
