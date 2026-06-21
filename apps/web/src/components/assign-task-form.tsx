'use client';

import { useActionState } from 'react';
import { assignTaskAction } from '@/server/actions/tasks';
import type { AssignState } from '@/server/action-types';

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
      <select
        name="assigneeId"
        defaultValue={currentAssigneeId ?? ''}
        className="w-full rounded-lg border border-border bg-bg p-2 text-sm outline-none focus:border-accent"
      >
        <option value="">— Sin responsable —</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {warned && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          <p className="font-medium">{state.message}</p>
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
        className={`w-full rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
          warned ? 'bg-amber-500 text-bg' : 'bg-accent text-bg'
        }`}
      >
        {pending ? 'Asignando…' : warned ? 'Asignar igual' : 'Asignar'}
      </button>

      {state.status === 'assigned' && <p className="text-xs text-emerald-400">{state.message}</p>}
      {state.status === 'error' && <p className="text-xs text-red-400">{state.message}</p>}
    </form>
  );
}
