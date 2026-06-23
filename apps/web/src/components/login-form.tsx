'use client';

import { useActionState } from 'react';
import { loginAction } from '@/server/actions/auth';
import type { LoginState } from '@/server/action-types';

const INITIAL: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, INITIAL);

  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="font-meta mb-1 block text-[10px] uppercase tracking-[0.16em] text-muted">Email</label>
        <input
          name="email"
          type="email"
          required
          defaultValue="admin@pulso.local"
          className="w-full rounded-xl border border-border bg-bg/50 px-3 py-2 text-sm outline-none transition focus:border-accent"
        />
      </div>
      <div>
        <label className="font-meta mb-1 block text-[10px] uppercase tracking-[0.16em] text-muted">Contraseña</label>
        <input
          name="password"
          type="password"
          required
          className="w-full rounded-xl border border-border bg-bg/50 px-3 py-2 text-sm outline-none transition focus:border-accent"
        />
      </div>
      {state.error && <p className="text-xs text-[var(--danger)]">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
