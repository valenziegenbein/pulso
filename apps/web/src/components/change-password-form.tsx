'use client';

import { useActionState } from 'react';
import { changePasswordAction } from '@/server/actions/auth';
import type { AuthFlowState } from '@/server/action-types';

const INITIAL: AuthFlowState = {};

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, INITIAL);
  return (
    <form action={action} className="space-y-3">
      <input name="currentPassword" type="password" required autoComplete="current-password" placeholder="Contraseña actual" className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
      <input name="newPassword" type="password" required minLength={12} maxLength={256} autoComplete="new-password" placeholder="Nueva contraseña" className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
      <input name="confirmation" type="password" required minLength={12} maxLength={256} autoComplete="new-password" placeholder="Repetir contraseña" className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
      {state.error && <p className="text-xs text-[var(--danger)]">{state.error}</p>}
      {state.message && <p className="text-xs text-muted">{state.message}</p>}
      <button type="submit" disabled={pending} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-40">
        {pending ? 'Actualizando…' : 'Cambiar contraseña'}
      </button>
    </form>
  );
}
