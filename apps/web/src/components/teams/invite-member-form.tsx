'use client';

import { useActionState } from 'react';
import { invitePersonAction } from '@/server/actions/teams';
import type { InviteState } from '@/server/action-types';
import { inputCls, selectCls } from '@/components/teams/ui';

const INITIAL: InviteState = {};

type RoleOption = readonly [string, string];

export function InviteMemberForm({
  teams,
  roleOptions,
  fixedTeamId,
}: {
  teams: { id: string; name: string }[];
  roleOptions: readonly RoleOption[];
  /** Si se pasa, el equipo queda fijo (no se muestra el selector). */
  fixedTeamId?: string;
}) {
  const [state, action, pending] = useActionState(invitePersonAction, INITIAL);

  return (
    <form action={action} className="space-y-2.5">
      <input name="email" type="email" required placeholder="Email" className={inputCls} />
      <select name="roleKey" defaultValue="MEMBER" className={selectCls}>
        {roleOptions.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {fixedTeamId ? (
        <input type="hidden" name="teamId" value={fixedTeamId} />
      ) : (
        <select name="teamId" className={selectCls}>
          <option value="">Sin equipo</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      )}

      {state.status === 'error' && state.error && (
        <p className="text-xs text-[var(--danger)]">{state.error}</p>
      )}
      {state.status === 'created' && state.message && (
        <p className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-fg">{state.message}</p>
      )}
      {state.status === 'updated' && state.message && (
        <p className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-fg">{state.message}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
      >
        {pending ? 'Invitando…' : 'Invitar miembro'}
      </button>
    </form>
  );
}
