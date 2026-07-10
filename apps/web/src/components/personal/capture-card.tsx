'use client';

import { useState, type ReactNode } from 'react';
import { usePersonal, type EntryType } from '@/lib/personal/store';
import { AiError, generateDraft } from '@/lib/personal/ai';
import { ProjectChooser } from './project-chooser';

interface Draft {
  type: EntryType;
  title: string;
  content: string;
}

/** Superficie de captura: una frase → la IA propone una entrada → el humano
 *  guarda/edita/descarta. Se guarda en el proyecto en foco. */
export function CaptureCard({ projectId }: { projectId?: string } = {}) {
  const { focusProject, projects, addEntry, ai, aiConfig } = usePersonal();
  const project = projectId ? projects.find((p) => p.id === projectId) : focusProject;
  const [note, setNote] = useState('');
  const [attach, setAttach] = useState('');
  const [showAttach, setShowAttach] = useState(false);
  const [intent, setIntent] = useState<EntryType | null>(null);

  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  async function generate() {
    if (note.trim().length === 0) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const s = await generateDraft({
        note,
        task: project ? { title: project.name } : undefined,
        projectContext: project?.context,
        attachmentsHint: attach ? [attach] : undefined,
        ai,
        config: aiConfig,
      });
      setDraft({ type: intent ?? s.type, title: s.title, content: s.content });
    } catch (e) {
      setError(
        e instanceof AiError && e.code === 'rate_limited'
          ? 'Demasiados pedidos. Probá en un momento.'
          : 'No se pudo generar. Revisá tu IA en Ajustes.',
      );
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setDraft(null);
    setNote('');
    setAttach('');
    setShowAttach(false);
    setIntent(null);
    setEditing(false);
    setSaved(false);
  }

  function save() {
    if (!draft) return;
    addEntry({ projectId: project?.id ?? null, type: draft.type, title: draft.title, content: draft.content });
    setSaved(true);
    setTimeout(reset, 1500);
  }

  return (
    <section className="rounded-3xl border border-border bg-surface/50 p-6 sm:p-8">
      <p className="font-meta text-[11px] uppercase tracking-[0.22em] text-accent">¿Qué estás haciendo?</p>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Revisando el sistema de tickets internos…"
        className="mt-3 w-full resize-none border-b border-border bg-transparent pb-3 font-display text-2xl leading-snug outline-none transition placeholder:text-muted/40 focus:border-accent sm:text-3xl"
      />

      {showAttach && (
        <input
          value={attach}
          onChange={(e) => setAttach(e.target.value)}
          placeholder="Pegá un link o ruta (captura manual)"
          className="mt-4 w-full rounded-xl border border-border bg-bg/60 p-3 text-sm outline-none placeholder:text-muted/50 focus:border-accent"
        />
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Chip active={showAttach} onClick={() => setShowAttach((v) => !v)}>📎 Adjuntar</Chip>
        <Chip active={intent === 'BLOCKER'} onClick={() => setIntent((v) => (v === 'BLOCKER' ? null : 'BLOCKER'))}>⛔ Bloqueo</Chip>
        <Chip active={intent === 'DECISION'} onClick={() => setIntent((v) => (v === 'DECISION' ? null : 'DECISION'))}>◆ Decisión</Chip>
        <button
          onClick={generate}
          disabled={loading || note.trim().length === 0}
          className="ml-auto rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
        >
          {loading ? 'Generando…' : 'Generar bitácora'}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      {draft && (
        <div className="pulso-reveal mt-6 rounded-2xl border border-border bg-bg/50 p-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-accent">✦</span>
            <span className="font-meta text-[11px] uppercase tracking-[0.18em] text-muted">Bitácora sugerida · {draft.type}</span>
          </div>
          {editing ? (
            <>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                className="mb-2 w-full rounded-lg border border-border bg-surface p-2 font-display text-lg outline-none focus:border-accent"
              />
              <textarea
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                rows={4}
                className="w-full resize-none rounded-lg border border-border bg-surface p-2 text-sm outline-none focus:border-accent"
              />
            </>
          ) : (
            <>
              <h3 className="font-display text-xl">{draft.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{draft.content}</p>
            </>
          )}

          {saved ? (
            <p className="mt-4 text-sm text-emerald-300">✓ Guardado en {project?.name ?? 'tu bitácora'}.</p>
          ) : (
            <div className="mt-4 flex gap-2 text-sm">
              <button onClick={save} className="rounded-full bg-accent px-5 py-2 font-medium text-bg transition hover:brightness-110">Guardar</button>
              <button onClick={() => setEditing((v) => !v)} className="rounded-full border border-border px-4 py-2 transition hover:border-accent">{editing ? 'Listo' : 'Editar'}</button>
              <button onClick={reset} className="rounded-full px-4 py-2 text-muted transition hover:text-fg">Descartar</button>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
        {projectId ? (
          <span className="font-meta text-[11px] uppercase tracking-[0.14em] text-muted">
            en <span className="text-accent">{project?.name}</span>
          </span>
        ) : (
          <ProjectChooser variant="inline" />
        )}
        <span className="font-meta text-[10px] uppercase tracking-[0.18em] text-muted/60">✦ la IA propone · vos aprobás</span>
      </div>
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs transition ${
        active ? 'border-accent text-accent' : 'border-border text-muted hover:border-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}
