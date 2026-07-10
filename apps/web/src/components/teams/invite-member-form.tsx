'use client';

import { useActionState, useState } from 'react';
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
      <input name="name" required placeholder="Nombre" className={inputCls} />
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

      <div>
        <input
          name="password"
          type="text"
          minLength={8}
          maxLength={100}
          autoComplete="off"
          placeholder="Contraseña (opcional)"
          className={inputCls}
        />
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          Si la dejás vacía, generamos una temporal y te la mostramos para que la compartas.
        </p>
      </div>

      {state.status === 'error' && state.error && (
        <p className="text-xs text-[var(--danger)]">{state.error}</p>
      )}
      {state.status === 'created' && state.generatedPassword && (
        <GeneratedPassword email={state.email} password={state.generatedPassword} />
      )}
      {state.status === 'created' && !state.generatedPassword && state.message && (
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
        {pending ? 'Añadiendo…' : 'Añadir miembro'}
      </button>
    </form>
  );
}

function GeneratedPassword({ email, password }: { email?: string; password: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Sin portapapeles: la contraseña ya está visible para copiar a mano.
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-accent/40 bg-surface px-3 py-2.5">
      <p className="text-xs text-fg">
        Miembro añadido{email ? <> (<span className="text-muted">{email}</span>)</> : null}. Contraseña temporal —
        compartila; podrá cambiarla luego.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 select-all rounded-lg bg-bg px-2.5 py-1.5 font-meta text-sm text-fg">{password}</code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition hover:border-accent hover:text-fg"
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}
