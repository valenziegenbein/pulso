'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { WORKLOG_TYPE, type WorklogType } from '@pulso/shared';
import { saveWorklogDraftAction } from '@/server/actions/worklog';
import { VersionTag } from './version-tag';

interface FocusItem {
  id: string;
  title: string;
  status: string;
  teamName: string;
  blocked: boolean;
  lastNote: string | null;
}

interface Draft {
  type: WorklogType;
  title: string;
  content: string;
}

type View = 'collapsed' | 'quick' | 'full';

/** Puente al shell de escritorio (existe solo dentro de Electron). */
type PulsoBridge = {
  isDesktop?: boolean;
  setView?: (v: View) => void;
  hideWidget?: () => void;
};
function desktopBridge(): PulsoBridge | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { pulso?: PulsoBridge }).pulso : undefined;
}

function useElapsed(): string {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Widget de Pulso con 3 estados: colapsado (pill pegado al borde), rápido
 * (solo captura) y completo. "La IA propone, el humano aprueba"; el adjunto es
 * siempre manual y voluntario (no hay captura automática).
 */
export function PulsoWidget({ focus }: { focus: FocusItem[] }) {
  const elapsed = useElapsed();
  const [isDesktop, setIsDesktop] = useState(false);
  const [view, setView] = useState<View>('full');

  const [note, setNote] = useState('');
  const [attachment, setAttachment] = useState('');
  const [showAttach, setShowAttach] = useState(false);
  const [intentType, setIntentType] = useState<WorklogType | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>(focus[0]?.id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  const selected = focus.find((f) => f.id === selectedTaskId);

  useEffect(() => {
    if (desktopBridge()?.isDesktop) {
      setIsDesktop(true);
      const initial = new URLSearchParams(window.location.search).get('view') as View | null;
      if (initial === 'collapsed' || initial === 'quick' || initial === 'full') setView(initial);
    }
  }, []);

  // Si se cierra sesión en la ventana principal, el widget vuelve al cartel.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/me', { cache: 'no-store' });
        const data = (await res.json()) as { authed?: boolean };
        if (!data.authed) {
          clearInterval(id);
          window.location.reload();
        }
      } catch {
        /* reintenta */
      }
    }, 5000);
    return () => clearInterval(id);
  }, []);

  function changeView(next: View) {
    setView(next);
    desktopBridge()?.setView?.(next);
  }

  async function generate() {
    if (note.trim().length === 0) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/worklog/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          note,
          task: selected ? { title: selected.title, teamName: selected.teamName } : undefined,
          attachmentsHint: attachment ? [attachment] : undefined,
        }),
      });
      if (!res.ok) {
        setError(res.status === 429 ? 'Demasiados pedidos. Probá en un momento.' : 'No se pudo generar la sugerencia.');
        return;
      }
      const data = (await res.json()) as { suggestion: Draft };
      setDraft(intentType ? { ...data.suggestion, type: intentType } : data.suggestion);
      if (view === 'quick') changeView('full'); // para mostrar sugerencia + foco
    } catch {
      setError('Error de red.');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setDraft(null);
    setNote('');
    setAttachment('');
    setShowAttach(false);
    setIntentType(null);
    setEditing(false);
    setSaved(false);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await saveWorklogDraftAction({
        type: draft.type,
        title: draft.title,
        content: draft.content,
        taskId: selectedTaskId,
        source: 'AI_SUGGESTED',
        attachment: attachment.trim() ? { url: attachment.trim(), kind: 'SCREENSHOT' } : undefined,
      });
      setSaved(true);
    } catch {
      setError('No se pudo guardar el avance.');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------- Colapsado
  if (view === 'collapsed') {
    return (
      <div className="pulso-glass drag-region flex items-center gap-2 rounded-full border border-border px-3 py-1.5 shadow-2xl">
        <span className="text-emerald-400">●</span>
        <button onClick={() => changeView('full')} className="no-drag text-sm font-medium">
          Pulso
        </button>
        <button
          onClick={() => changeView('quick')}
          className="no-drag ml-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-bg"
          title="Bitácora rápida"
        >
          +
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------ Rápido / Completo
  const quick = view === 'quick';

  return (
    <div className="pulso-glass max-h-[calc(100vh-0.5rem)] overflow-y-auto rounded-2xl border border-border p-4 shadow-2xl">
      {/* Header (zona de arrastre) */}
      <div className="drag-region -m-4 mb-1 flex items-center justify-between px-4 pb-1 pt-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-accent">✦</span> Pulso
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-muted">{elapsed}</span>
          {isDesktop && (
            <>
              {quick && (
                <HeaderBtn title="Expandir" onClick={() => changeView('full')}>
                  ⤢
                </HeaderBtn>
              )}
              <HeaderBtn title="Colapsar" onClick={() => changeView('collapsed')}>
                –
              </HeaderBtn>
              <HeaderBtn title="Ocultar (Ctrl+Shift+P)" onClick={() => desktopBridge()?.hideWidget?.()}>
                ✕
              </HeaderBtn>
            </>
          )}
        </div>
      </div>

      <p className="mb-2 text-xs text-muted">Contá en una frase qué estás haciendo.</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Ej: investigando Intercom para tickets internos"
        className="w-full resize-none rounded-lg border border-border bg-bg/60 p-2 text-sm outline-none focus:border-accent"
      />

      {/* Chips: con leyenda en completo, solo íconos en rápido */}
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        <Chip icon="📎" label="Adjuntar captura" compact={quick} active={showAttach} onClick={() => setShowAttach((v) => !v)} />
        <Chip icon="⛔" label="Marcar bloqueo" compact={quick} active={intentType === 'BLOCKER'} onClick={() => toggleIntent('BLOCKER')} />
        <Chip icon="◆" label="Pedir decisión" compact={quick} active={intentType === 'DECISION'} onClick={() => toggleIntent('DECISION')} />
      </div>

      {showAttach && (
        <input
          value={attachment}
          onChange={(e) => setAttachment(e.target.value)}
          placeholder="Pegá un link o ruta (captura manual y voluntaria)"
          className="mt-2 w-full rounded-lg border border-border bg-bg/60 p-2 text-xs outline-none focus:border-accent"
        />
      )}

      {!draft && (
        <button
          onClick={generate}
          disabled={loading || note.trim().length === 0}
          className="mt-3 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-40"
        >
          {loading ? 'Generando…' : 'Generar bitácora'}
        </button>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {/* Sugerencia + foco + acciones: solo en completo */}
      {!quick && draft && (
        <div className="mt-3 rounded-xl border border-border bg-bg/50 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-accent">✦</span>
            <span className="text-xs font-medium">Bitácora sugerida</span>
            <span className="ml-auto rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
              {draft.type}
            </span>
          </div>
          {editing ? (
            <>
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
            </>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-muted">{draft.content}</p>
          )}
        </div>
      )}

      {!quick && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs text-muted">Tu foco ahora</p>
          {focus.length === 0 ? (
            <p className="text-xs text-muted">Sin tareas activas asignadas.</p>
          ) : (
            <ul className="space-y-1">
              {focus.map((f) => {
                const active = f.id === selectedTaskId;
                return (
                  <li key={f.id}>
                    <button
                      onClick={() => setSelectedTaskId(f.id)}
                      className={`w-full rounded-lg border px-2.5 py-1.5 text-left text-xs ${
                        active ? 'border-accent bg-bg/50' : 'border-border hover:border-muted'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className={f.blocked ? 'text-red-400' : 'text-emerald-400'}>●</span>
                        <span className="truncate">{f.title}</span>
                      </span>
                      {f.lastNote && (
                        <span className="mt-0.5 block truncate text-[11px] text-muted">Última vez: {f.lastNote}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {!quick && draft && (
        <div className="mt-3">
          {saved ? (
            <p className="text-center text-xs text-emerald-400">✓ Avance guardado como borrador. Aprobalo para publicarlo.</p>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-40"
              >
                {saving ? 'Guardando…' : 'Guardar avance'}
              </button>
              <button onClick={() => setEditing((v) => !v)} className="rounded-lg border border-border px-3 py-2 text-sm hover:border-accent">
                {editing ? 'Listo' : 'Editar'}
              </button>
              <button onClick={reset} className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:border-muted">
                Descartar
              </button>
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-center text-[11px] text-muted">
        ✦ La IA propone. Vos aprobás. <VersionTag className="text-muted/60" />
      </p>
    </div>
  );

  function toggleIntent(type: WorklogType) {
    setIntentType((current) => (current === type ? null : type));
  }
}

function HeaderBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} title={title} className="no-drag rounded px-1.5 text-muted hover:text-fg">
      {children}
    </button>
  );
}

function Chip({
  icon,
  label,
  compact,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  compact: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 ${
        active ? 'border-accent text-accent' : 'border-border text-muted hover:border-muted'
      }`}
    >
      <span>{icon}</span>
      {!compact && <span>{label}</span>}
    </button>
  );
}
