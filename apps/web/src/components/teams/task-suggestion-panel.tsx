'use client';

import { useState } from 'react';
import { createTaskAction } from '@/server/actions/tasks';
import { PRIORITY_LABEL } from '@/lib/labels';
import { inputCls, selectCls, textareaCls } from './ui';

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
    <section className="rounded-2xl border border-accent/30 bg-surface/60 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="pulso-beat inline-block text-accent">✦</span>
        <div>
          <h2 className="font-display text-lg leading-tight">Asignar tarea con IA</h2>
          <p className="font-meta text-[10px] uppercase tracking-[0.16em] text-muted">La IA propone · el admin aprueba</p>
        </div>
      </div>

      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={3}
        placeholder="Ej: Preparar propuesta para mejorar tickets internos y definir próximos pasos"
        className={textareaCls}
      />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={selectCls}>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={selectCls}>
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
        className="mt-3 w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
      >
        {loading ? 'Generando…' : 'Generar tarea'}
      </button>
      {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}

      {suggestion && (
        <div className="pulso-reveal mt-4 rounded-xl border border-border bg-bg/50 p-4">
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
                  className={`${inputCls} font-medium`}
                />
                <textarea
                  name="description"
                  value={suggestion.description}
                  onChange={(e) => update('description', e.target.value)}
                  rows={3}
                  className={textareaCls}
                />
                <input
                  name="expectedOutcome"
                  value={suggestion.expectedOutcome ?? ''}
                  onChange={(e) => update('expectedOutcome', e.target.value)}
                  placeholder="Resultado esperado"
                  className={inputCls}
                />
                <input
                  name="definitionOfDone"
                  value={suggestion.definitionOfDone ?? ''}
                  onChange={(e) => update('definitionOfDone', e.target.value)}
                  placeholder="Definición de terminado"
                  className={inputCls}
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
                    <h3 className="font-display text-lg leading-tight">{suggestion.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{suggestion.description}</p>
                  </div>
                  <span className="font-meta shrink-0 rounded-full border border-border px-2.5 py-1 text-[10px] uppercase tracking-wide text-accent">
                    {PRIORITY_LABEL[suggestion.suggestedPriority] ?? suggestion.suggestedPriority}
                  </span>
                </div>
                {suggestion.expectedOutcome && (
                  <p className="text-xs text-muted">
                    <span className="text-fg">Resultado:</span> {suggestion.expectedOutcome}
                  </p>
                )}
                {suggestion.reasoning && <p className="text-[11px] italic text-muted/80">Por qué se sugiere: {suggestion.reasoning}</p>}
              </>
            )}

            <div className="flex gap-2 pt-1">
              <button className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition hover:brightness-110">Asignar</button>
              <button type="button" onClick={() => setEditing((v) => !v)} className="rounded-full border border-border px-4 py-2 text-sm transition hover:border-accent">
                {editing ? 'Listo' : 'Editar'}
              </button>
              <button type="button" onClick={() => setSuggestion(null)} className="rounded-full px-4 py-2 text-sm text-muted transition hover:text-fg">
                Descartar
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
