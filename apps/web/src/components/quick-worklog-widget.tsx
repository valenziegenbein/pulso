'use client';

import { useState } from 'react';
import { WORKLOG_TYPE, type WorklogType } from '@pulso/shared';
import { saveWorklogDraftAction } from '@/server/actions/worklog';

interface Draft {
  type: WorklogType;
  title: string;
  content: string;
}

interface TaskContext {
  title?: string;
  teamName?: string;
}

/**
 * Widget rápido de bitácora. "La IA propone, vos decidís."
 *
 * Flujo: micro-nota → sugerencia (borrador editable) → el humano acepta,
 * edita, descarta o convierte. Al aceptar se guarda como BORRADOR (DRAFT);
 * nada se publica sin aprobación humana posterior.
 */
export function QuickWorklogWidget({ task, taskId }: { task?: TaskContext; taskId?: string }) {
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/worklog/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note, task, attachmentsHint: link ? [link] : undefined }),
      });
      if (!res.ok) {
        setError(res.status === 429 ? 'Demasiados pedidos. Probá en un momento.' : 'No se pudo generar la sugerencia.');
        return;
      }
      const data = (await res.json()) as { suggestion: Draft };
      setDraft(data.suggestion);
    } catch {
      setError('Error de red.');
    } finally {
      setLoading(false);
    }
  }

  function discard() {
    setDraft(null);
    setNote('');
    setLink('');
    setSaved(false);
  }

  async function accept() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await saveWorklogDraftAction({
        type: draft.type,
        title: draft.title,
        content: draft.content,
        taskId,
        source: 'AI_SUGGESTED',
      });
      setSaved(true);
    } catch {
      setError('No se pudo guardar el borrador.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-accent">✦</span>
        <h2 className="text-sm font-medium">Registrar avance</h2>
      </div>
      <p className="mb-3 text-xs text-muted">Contá en una frase qué estás haciendo.</p>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Ej: investigando intercom para tickets internos"
        className="w-full resize-none rounded-lg border border-border bg-bg p-2 text-sm outline-none focus:border-accent"
      />
      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="Adjuntar link (opcional)"
        className="mt-2 w-full rounded-lg border border-border bg-bg p-2 text-xs outline-none focus:border-accent"
      />

      <button
        onClick={generate}
        disabled={loading || note.trim().length === 0}
        className="mt-3 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-40"
      >
        {loading ? 'Generando…' : 'Generar sugerencia'}
      </button>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {draft && (
        <div className="mt-4 rounded-lg border border-border bg-bg p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="rounded bg-surface px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
              Borrador · IA
            </span>
            <select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as WorklogType })}
              className="rounded border border-border bg-surface px-2 py-1 text-xs"
            >
              {WORKLOG_TYPE.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className="mb-2 w-full rounded border border-border bg-surface p-2 text-sm font-medium outline-none focus:border-accent"
          />
          <textarea
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            rows={4}
            className="w-full resize-none rounded border border-border bg-surface p-2 text-sm outline-none focus:border-accent"
          />

          {saved ? (
            <p className="mt-3 text-xs text-emerald-400">✓ Guardado como borrador. Aprobalo para publicarlo.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button
                onClick={accept}
                disabled={saving}
                className="rounded-lg bg-accent px-3 py-1.5 font-medium text-bg disabled:opacity-40"
              >
                {saving ? 'Guardando…' : 'Aceptar'}
              </button>
              <button
                onClick={() => setDraft({ ...draft, type: 'BLOCKER' })}
                className="rounded-lg border border-border px-3 py-1.5"
              >
                Convertir en bloqueo
              </button>
              <button
                onClick={() => setDraft({ ...draft, type: 'DECISION' })}
                className="rounded-lg border border-border px-3 py-1.5"
              >
                Convertir en decisión
              </button>
              <button onClick={discard} className="rounded-lg border border-border px-3 py-1.5 text-muted">
                Descartar
              </button>
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-center text-[11px] text-muted">✦ La IA propone. Vos decidís.</p>
    </section>
  );
}
