'use client';

import { useState } from 'react';
import { WORKLOG_TYPE, type WorklogType } from '@pulso/shared';
import { addBlockerAction } from '@/server/actions/tasks';
import { requestDecisionAction } from '@/server/actions/decisions';
import { saveWorklogDraftAction } from '@/server/actions/worklog';
import { WORKLOG_TYPE_LABEL } from '@/lib/labels';
import { inputCls, selectCls, textareaCls } from '@/components/teams/ui';

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
        attachment: link.trim() ? { url: link.trim(), kind: 'LINK' } : undefined,
      });
      if (taskId && draft.type === 'BLOCKER') {
        const form = new FormData();
        form.set('taskId', taskId);
        form.set('title', draft.title);
        form.set('description', draft.content);
        await addBlockerAction(form);
      }
      if (taskId && draft.type === 'DECISION') {
        const form = new FormData();
        form.set('taskId', taskId);
        form.set('title', draft.title);
        form.set('context', draft.content);
        await requestDecisionAction(form);
      }
      setSaved(true);
    } catch {
      setError('No se pudo guardar el borrador.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-accent/30 bg-surface/60 p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="pulso-beat inline-block text-accent">✦</span>
        <h2 className="font-display text-lg leading-tight">Registrar avance</h2>
      </div>
      <p className="mb-3 text-sm text-muted">Contá en una frase qué estás haciendo.</p>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Ej: investigando intercom para tickets internos"
        className={textareaCls}
      />
      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="Adjuntar link (opcional)"
        className={`${inputCls} mt-2`}
      />

      <button
        onClick={generate}
        disabled={loading || note.trim().length === 0}
        className="mt-3 w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
      >
        {loading ? 'Generando…' : 'Generar sugerencia'}
      </button>

      {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}

      {draft && (
        <div className="pulso-reveal mt-4 rounded-xl border border-border bg-bg/50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-meta text-[10px] uppercase tracking-[0.16em] text-accent">Borrador · IA</span>
            <select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as WorklogType })}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
            >
              {WORKLOG_TYPE.map((t) => (
                <option key={t} value={t}>
                  {WORKLOG_TYPE_LABEL[t] ?? t}
                </option>
              ))}
            </select>
          </div>

          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className={`${inputCls} mb-2 font-medium`}
          />
          <textarea
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            rows={4}
            className={textareaCls}
          />

          {saved ? (
            <p className="mt-3 text-xs text-[var(--ok)]">✓ Guardado como borrador. Aprobalo para publicarlo.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button
                onClick={accept}
                disabled={saving}
                className="rounded-full bg-accent px-4 py-1.5 font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
              >
                {saving ? 'Guardando…' : 'Aceptar'}
              </button>
              <button onClick={() => setDraft({ ...draft, type: 'BLOCKER' })} className="rounded-full border border-border px-3 py-1.5 transition hover:border-accent">
                Convertir en bloqueo
              </button>
              <button onClick={() => setDraft({ ...draft, type: 'DECISION' })} className="rounded-full border border-border px-3 py-1.5 transition hover:border-accent">
                Convertir en decisión
              </button>
              <button onClick={discard} className="rounded-full px-3 py-1.5 text-muted transition hover:text-fg">
                Descartar
              </button>
            </div>
          )}
        </div>
      )}

      <p className="font-meta mt-3 text-center text-[10px] uppercase tracking-[0.16em] text-muted/70">✦ la IA propone · vos decidís</p>
    </section>
  );
}
