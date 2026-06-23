'use client';

import { useState } from 'react';
import { createTaskAction } from '@/server/actions/tasks';
import { PRIORITY_LABEL } from '@/lib/labels';

interface TeamOption {
  id: string;
  name: string;
}

interface PersonOption {
  id: string;
  name: string;
}

interface SuggestedTask {
  title: string;
  description: string;
  expectedOutcome?: string;
  definitionOfDone?: string;
  suggestedPriority: string;
  suggestedAssigneeId?: string;
  dueDate?: string;
  reasoning?: string;
}

export function TaskSuggestionPanel({ teams, people }: { teams: TeamOption[]; people: PersonOption[] }) {
  const [instruction, setInstruction] = useState('');
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const [assigneeId, setAssigneeId] = useState('');
  const [suggestion, setSuggestion] = useState<SuggestedTask | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!instruction.trim()) return;
    setLoading(true);
    setError(null);
    setSuggestion(null);
    try {
      const res = await fetch('/api/tasks/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instruction, teamId: teamId || undefined, assigneeId: assigneeId || undefined }),
      });
      if (!res.ok) {
        setError('No se pudo generar. Escribi una tarea manual o proba de nuevo.');
        return;
      }
      const data = (await res.json()) as { suggestion: SuggestedTask };
      setSuggestion(data.suggestion);
      setAssigneeId(data.suggestion.suggestedAssigneeId ?? assigneeId);
      setEditing(false);
    } catch {
      setError('Error de red al generar la tarea.');
    } finally {
      setLoading(false);
    }
  }

  function update<K extends keyof SuggestedTask>(key: K, value: SuggestedTask[K]) {
    if (!suggestion) return;
    setSuggestion({ ...suggestion, [key]: value });
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3">
        <h2 className="text-sm font-medium">Asignar tarea con IA</h2>
        <p className="text-xs text-muted">La IA propone. El admin aprueba.</p>
      </div>

      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={3}
        placeholder="Ej: Preparar propuesta para mejorar tickets internos y definir proximos pasos"
        className="w-full resize-none rounded-lg border border-border bg-bg p-2 text-sm outline-none focus:border-accent"
      />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="rounded-lg border border-border bg-bg p-2 text-sm">
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="rounded-lg border border-border bg-bg p-2 text-sm">
          <option value="">Responsable sugerido</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </div>
      <button
        onClick={generate}
        disabled={loading || !instruction.trim() || teams.length === 0}
        className="mt-3 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-40"
      >
        {loading ? 'Generando...' : 'Generar tarea'}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {suggestion && (
        <div className="mt-4 rounded-xl border border-border bg-bg/60 p-3">
          <form action={createTaskAction} className="space-y-2">
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="assigneeId" value={assigneeId} />
            <input type="hidden" name="priority" value={suggestion.suggestedPriority} />
            {suggestion.dueDate && <input type="hidden" name="dueDate" value={suggestion.dueDate} />}

            {editing ? (
              <>
                <input
                  name="title"
                  value={suggestion.title}
                  onChange={(e) => update('title', e.target.value)}
                  className="w-full rounded border border-border bg-surface p-2 text-sm font-medium outline-none focus:border-accent"
                />
                <textarea
                  name="description"
                  value={suggestion.description}
                  onChange={(e) => update('description', e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded border border-border bg-surface p-2 text-sm outline-none focus:border-accent"
                />
                <input
                  name="expectedOutcome"
                  value={suggestion.expectedOutcome ?? ''}
                  onChange={(e) => update('expectedOutcome', e.target.value)}
                  placeholder="Resultado esperado"
                  className="w-full rounded border border-border bg-surface p-2 text-sm outline-none focus:border-accent"
                />
                <input
                  name="definitionOfDone"
                  value={suggestion.definitionOfDone ?? ''}
                  onChange={(e) => update('definitionOfDone', e.target.value)}
                  placeholder="Definicion de terminado"
                  className="w-full rounded border border-border bg-surface p-2 text-sm outline-none focus:border-accent"
                />
              </>
            ) : (
              <>
                <input type="hidden" name="title" value={suggestion.title} />
                <input type="hidden" name="description" value={suggestion.description} />
                <input type="hidden" name="expectedOutcome" value={suggestion.expectedOutcome ?? ''} />
                <input type="hidden" name="definitionOfDone" value={suggestion.definitionOfDone ?? ''} />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium">{suggestion.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{suggestion.description}</p>
                  </div>
                  <span className="rounded bg-surface px-2 py-1 text-[10px] text-muted">
                    {PRIORITY_LABEL[suggestion.suggestedPriority] ?? suggestion.suggestedPriority}
                  </span>
                </div>
                {suggestion.expectedOutcome && (
                  <p className="text-xs text-muted">
                    <span className="text-fg">Resultado:</span> {suggestion.expectedOutcome}
                  </p>
                )}
                {suggestion.reasoning && <p className="text-[11px] text-muted">Por que se sugiere: {suggestion.reasoning}</p>}
              </>
            )}

            <div className="flex gap-2 pt-1 text-xs">
              <button className="rounded-lg bg-accent px-4 py-2 font-medium text-bg">Asignar</button>
              <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-lg border border-border px-3 py-2 hover:border-accent">
                {editing ? 'Listo' : 'Editar'}
              </button>
              <button type="button" onClick={() => setSuggestion(null)} className="rounded-lg border border-border px-3 py-2 text-muted hover:border-muted">
                Descartar
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
