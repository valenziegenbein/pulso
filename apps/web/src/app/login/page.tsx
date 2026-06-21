import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/context';
import { LoginForm } from '@/components/login-form';

export default async function LoginPage() {
  if (await getAuthContext()) redirect('/');

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold">
            <span className="text-accent">✦</span> Pulso
          </div>
          <p className="mt-1 text-sm text-muted">Organizador interno</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-[11px] text-muted">
          Demo: admin@pulso.local / pulso1234
        </p>
      </div>
    </main>
  );
}
