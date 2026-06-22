'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePersonal, type EntryType } from '@/lib/personal/store';
import { ProjectChooser } from './project-chooser';

type Bridge = {
  isDesktop?: boolean;
  hideWidget?: () => void;
  collapse?: () => void;
  expand?: () => void;
};
function bridge(): Bridge | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { pulso?: Bridge }).pulso : undefined;
}

const ENTRY_TYPES: EntryType[] = ['PROGRESS', 'RESEARCH', 'DECISION', 'BLOCKER', 'NOTE', 'DELIVERY'];

interface Draft {
  type: EntryType;
  title: string;
  content: string;
}

function useElapsed(): string {
  const [s, setS] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setS((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function useWindowWidth(): number {
  const [w, setW] = useState(1024);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return w;
}

/** Widget personal flotante (atelier). Captura local-first; comparte datos con
 *  la app por localStorage. Vive en la ventana siempre-encima del shell.
 *  - `embedded`: se muestra dentro del onboarding (sin controles de ventana).
 *  - En escritorio puede minimizarse a una "pill" pegada al borde. */
export function PersonalWidget({ embedded = false }: { embedded?: boolean } = {}) {
  const elapsed = useElapsed();
  const width = useWindowWidth();
  const { focusProject, addEntry } = usePersonal();
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => setIsDesktop(Boolean(bridge()?.isDesktop)), []);

  const [note, setNote] = useState('');
  const [attach, setAttach] = useState('');
  const [showAttach, setShowAttach] = useState(false);
  const [intent, setIntent] = useState<EntryType | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collapsed = isDesktop && !embedded && width < 240;

  async function generate() {
    if (note.trim().length === 0 || !focusProject) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/worklog/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          note,
          task: { title: focusProject.name },
          attachmentsHint: attach ? [attach] : undefined,
        }),
      });
      if (!res.ok) {
        setError(res.status === 429 ? 'Demasiados pedidos. Probá en un momento.' : 'No se pudo generar.');
        return;
      }
      const data = (await res.json()) as { suggestion: { type: string; title: string; content: string } };
      const t = ENTRY_TYPES.includes(data.suggestion.type as EntryType) ? (data.suggestion.type as EntryType) : 'NOTE';
      setDraft({ type: intent ?? t, title: data.suggestion.title, content: data.suggestion.content });
    } catch {
      setError('Error de red.');
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
    setSaved(false);
  }

  function save() {
    if (!draft || !focusProject) return;
    setSaving(true);
    addEntry({ projectId: focusProject.id, type: draft.type, title: draft.title, content: draft.content });
    setSaved(true);
    setSaving(false);
    setTimeout(reset, 1400);
  }

  // ---- Pill minimizada (pegada al borde) ----
  if (collapsed) {
    return (
      <div className="drag-region flex w-[160px] items-center gap-2 rounded-full border border-border bg-surface/95 px-3 py-2 shadow-2xl backdrop-blur-xl">
        <span className="pulso-beat inline-block text-accent">✦</span>
        <span className="text-sm font-semibold">Pulso</span>
        <button
          onClick={() => bridge()?.expand?.()}
          className="font-meta no-drag ml-auto rounded-full bg-accent px-3 py-1 text-[11px] font-medium text-bg transition hover:brightness-110"
        >
          Anotar
        </button>
      </div>
    );
  }

  // ---- Panel completo ----
  const canGenerate = note.trim().length > 0 && !!focusProject;
  return (
    <div className="w-[360px] rounded-2xl border border-border bg-surface/95 shadow-2xl backdrop-blur-xl">
      {!embedded && (
        <div className="drag-region flex items-center justify-between rounded-t-2xl border-b border-border/60 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="pulso-beat inline-block text-accent">✦</span> Pulso
          </div>
          <div className="flex items-center gap-2">
            <span className="font-meta text-[11px] text-muted">{elapsed}</span>
            {isDesktop && (
              <>
                <button onClick={() => bridge()?.collapse?.()} className="no-drag rounded px-1 text-muted transition hover:text-fg" title="Minimizar al borde">
                  —
                </button>
                <button onClick={() => bridge()?.hideWidget?.()} className="no-drag rounded px-1 text-muted transition hover:text-fg" title="Ocultar (Ctrl+Shift+P)">
                  ✕
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="p-4">
        <p className="font-meta text-[10px] uppercase tracking-[0.22em] text-accent">¿Qué estás haciendo?</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Investigando Intercom…"
          className="mt-2 w-full resize-none border-b border-border bg-transparent pb-2 font-display text-lg leading-snug outline-none placeholder:text-muted/40 focus:border-accent"
        />

        {showAttach && (
          <input
            value={attach}
            onChange={(e) => setAttach(e.target.value)}
            placeholder="Link o ruta (captura manual)"
            className="mt-3 w-full rounded-lg border border-border bg-bg/60 p-2 text-xs outline-none placeholder:text-muted/50 focus:border-accent"
          />
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <MiniChip active={showAttach} onClick={() => setShowAttach((v) => !v)}>📎</MiniChip>
          <MiniChip active={intent === 'BLOCKER'} onClick={() => setIntent((v) => (v === 'BLOCKER' ? null : 'BLOCKER'))}>⛔ Bloqueo</MiniChip>
          <MiniChip active={intent === 'DECISION'} onClick={() => setIntent((v) => (v === 'DECISION' ? null : 'DECISION'))}>◆ Decisión</MiniChip>
        </div>

        {!draft && (
          <button
            onClick={generate}
            disabled={loading || !canGenerate}
            className="mt-3 w-full rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
          >
            {loading ? 'Generando…' : 'Generar bitácora'}
          </button>
        )}

        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}

        {draft && (
          <div className="pulso-reveal mt-3 rounded-xl border border-border bg-bg/50 p-3">
            <span className="font-meta text-[10px] uppercase tracking-[0.16em] text-muted">Sugerida · {draft.type}</span>
            <h3 className="font-display mt-1 text-base leading-snug">{draft.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">{draft.content}</p>
            {saved ? (
              <p className="mt-3 text-xs text-emerald-300">✓ Guardado{focusProject ? ` en ${focusProject.name}` : ''}.</p>
            ) : (
              <div className="mt-3 flex gap-1.5 text-xs">
                <button onClick={save} disabled={saving} className="rounded-full bg-accent px-4 py-1.5 font-medium text-bg disabled:opacity-40">Guardar</button>
                <button onClick={reset} className="rounded-full px-3 py-1.5 text-muted transition hover:text-fg">Descartar</button>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
          {focusProject ? (
            <ProjectChooser variant="inline" />
          ) : (
            <span className="font-meta text-[11px] uppercase tracking-wide text-muted">Creá un proyecto para empezar</span>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`no-drag rounded-full border px-2.5 py-1 text-[11px] transition ${
        active ? 'border-accent text-accent' : 'border-border text-muted hover:border-muted hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}
