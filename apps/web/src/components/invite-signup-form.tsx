'use client';

import { useActionState } from 'react';
import { inviteSignupAction } from '@/server/actions/auth';
import type { AuthFlowState } from '@/server/action-types';

const INITIAL: AuthFlowState = {};

export function InviteSignupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(inviteSignupAction, INITIAL);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <input name="name" required minLength={2} maxLength={120} autoComplete="name" placeholder="Nombre" className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
      <input name="password" type="password" required minLength={12} maxLength={256} autoComplete="new-password" placeholder="Contraseña" className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
      <input name="confirmation" type="password" required minLength={12} maxLength={256} autoComplete="new-password" placeholder="Repetir contraseña" className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
      {state.error && <p className="text-xs text-[var(--danger)]">{state.error}</p>}
      <button type="submit" disabled={pending || !token} className="w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-bg disabled:opacity-40">
        {pending ? 'Creando…' : 'Crear cuenta y aceptar'}
      </button>
    </form>
  );
}
