'use client';

import { useActionState } from 'react';
import { assignTaskAction } from '@/server/actions/tasks';
import type { AssignState } from '@/server/action-types';
import { selectCls } from '@/components/teams/ui';

const INITIAL: AssignState = {};

export function AssignTaskForm({
  taskId,
  people,
  currentAssigneeId,
}: {
  taskId: string;
  people: { id: string; name: string }[];
  currentAssigneeId: string | null;
}) {
  const [state, action, pending] = useActionState(assignTaskAction, INITIAL);
  const warned = state.status === 'overload_warning';

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="taskId" value={taskId} />
      <select name="assigneeId" defaultValue={currentAssigneeId ?? ''} className={selectCls}>
        <option value="">— Sin responsable —</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {warned && (
        <div className="rounded-xl border border-[var(--warn)]/40 bg-[var(--warn)]/10 p-3 text-xs">
          <p className="font-medium text-[var(--warn)]">{state.message}</p>
          <ul className="mt-1 list-inside list-disc text-muted">
            {state.signals?.map((s) => (
              <li key={s.code}>{s.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* En la segunda pasada (tras la advertencia) se confirma la asignación. */}
      <input type="hidden" name="acknowledge" value={warned ? 'true' : 'false'} />

      <button
        type="submit"
        disabled={pending}
        className={`w-full rounded-xl px-3 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40 ${
          warned ? 'bg-[var(--warn)]' : 'bg-accent'
        }`}
      >
        {pending ? 'Asignando…' : warned ? 'Asignar igual' : 'Asignar'}
      </button>

      {state.status === 'assigned' && <p className="text-xs text-[var(--ok)]">{state.message}</p>}
      {state.status === 'error' && <p className="text-xs text-[var(--danger)]">{state.message}</p>}
    </form>
  );
}
