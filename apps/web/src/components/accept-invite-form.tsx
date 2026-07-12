'use client';

import { useActionState } from 'react';
import { acceptInviteAction } from '@/server/actions/auth';
import type { AuthFlowState } from '@/server/action-types';

const INITIAL: AuthFlowState = {};

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction, INITIAL);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error && <p className="text-xs text-[var(--danger)]">{state.error}</p>}
      {state.message && <p className="text-xs text-muted">{state.message}</p>}
      <button type="submit" disabled={pending || !token} className="w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-bg disabled:opacity-40">
        {pending ? 'Aceptando…' : 'Aceptar invitación'}
      </button>
    </form>
  );
}
