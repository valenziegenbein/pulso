'use client';

import { useActionState } from 'react';
import { forgotPasswordAction } from '@/server/actions/auth';
import type { AuthFlowState } from '@/server/action-types';

const INITIAL: AuthFlowState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, INITIAL);
  return (
    <form action={action} className="space-y-3">
      <label className="font-meta block text-[10px] uppercase tracking-[0.16em] text-muted" htmlFor="forgot-email">Email</label>
      <input id="forgot-email" name="email" type="email" required autoComplete="email" className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-accent" />
      {state.error && <p className="text-xs text-[var(--danger)]">{state.error}</p>}
      {state.message && <p className="text-xs text-muted">{state.message}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-bg disabled:opacity-40">
        {pending ? 'Preparando…' : 'Recuperar acceso'}
      </button>
    </form>
  );
}
