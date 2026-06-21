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
        <label className="mb-1 block text-xs text-muted">Email</label>
        <input
          name="email"
          type="email"
          required
          defaultValue="admin@pulso.local"
          className="w-full rounded-lg border border-border bg-bg p-2 text-sm outline-none focus:border-accent"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted">Contraseña</label>
        <input
          name="password"
          type="password"
          required
          className="w-full rounded-lg border border-border bg-bg p-2 text-sm outline-none focus:border-accent"
        />
      </div>
      {state.error && <p className="text-xs text-red-400">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-40"
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
