'use client';

import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type ReactNode } from 'react';
import { TASK_PRIORITY_ORDER, usePersonal, type EntryType } from '@/lib/personal/store';
import { AiError, generateDraft } from '@/lib/personal/ai';
import { ProjectChooser } from './project-chooser';

type Bridge = {
  isDesktop?: boolean;
  hideWidget?: () => void;
  collapse?: () => void;
  expand?: () => void;
  screenshot?: () => Promise<string | null>;
};
function bridge(): Bridge | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { pulso?: Bridge }).pulso : undefined;
}

interface Draft {
  type: EntryType;
  title: string;
  content: string;
}

/** Reduce una imagen (blob o data URL) a un data URL JPEG manejable para localStorage. */
async function downscale(src: string | Blob, maxW = 1100): Promise<string> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = url;
    });
    const scale = Math.min(1, maxW / img.width);
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return typeof src === 'string' ? src : url;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return typeof src === 'string' ? src : url;
  } finally {
    if (typeof src !== 'string') URL.revokeObjectURL(url);
  }
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

/** Widget personal flotante (atelier). Captura local-first con imagen (pegar o
 *  screenshot) y tareas pendientes del proyecto en foco. */
export function PersonalWidget({ embedded = false }: { embedded?: boolean } = {}) {
  const elapsed = useElapsed();
  const width = useWindowWidth();
  const { focusProject, addEntry, tasks, toggleTask, ai, aiConfig } = usePersonal();
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => setIsDesktop(Boolean(bridge()?.isDesktop)), []);

  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);
  const [intent, setIntent] = useState<EntryType | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collapsed = isDesktop && !embedded && width < 240;

  const pending = focusProject
    ? tasks
        .filter((t) => t.projectId === focusProject.id && !t.done)
        .sort((a, b) => TASK_PRIORITY_ORDER[a.priority] - TASK_PRIORITY_ORDER[b.priority])
    : [];

  async function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'));
    const blob = item?.getAsFile();
    if (!blob) return;
    e.preventDefault();
    setImage(await downscale(blob));
  }

  async function captureScreen() {
    const b = bridge();
    if (b?.isDesktop && b.screenshot) {
      setShooting(true);
      try {
        const shot = await b.screenshot();
        if (shot) setImage(await downscale(shot));
      } finally {
        setShooting(false);
      }
    } else {
      fileRef.current?.click();
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setImage(await downscale(f));
    e.target.value = '';
  }

  async function generate() {
    if (note.trim().length === 0 || !focusProject) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const s = await generateDraft({ note, task: { title: focusProject.name }, ai, config: aiConfig });
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
    setImage(null);
    setIntent(null);
    setSaved(false);
  }

  function save() {
    if (!draft || !focusProject) return;
    setSaving(true);
    addEntry({ projectId: focusProject.id, type: draft.type, title: draft.title, content: draft.content, image: image ?? undefined });
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
        <button onClick={() => bridge()?.expand?.()} className="font-meta no-drag ml-auto rounded-full bg-accent px-3 py-1 text-[11px] font-medium text-bg transition hover:brightness-110">
          Anotar
        </button>
      </div>
    );
  }

  // ---- Panel completo ----
  const canGenerate = note.trim().length > 0 && !!focusProject;
  return (
    <div className={`flex w-[360px] flex-col overflow-hidden rounded-2xl border border-border bg-surface/95 shadow-2xl backdrop-blur-xl ${embedded ? '' : 'max-h-[calc(100vh-1rem)]'}`}>
      {!embedded && (
        <div className="drag-region flex shrink-0 items-center justify-between rounded-t-2xl border-b border-border/60 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="pulso-beat inline-block text-accent">✦</span> Pulso
          </div>
          <div className="flex items-center gap-2">
            <span className="font-meta text-[11px] text-muted">{elapsed}</span>
            {isDesktop && (
              <>
                <button onClick={() => bridge()?.collapse?.()} className="no-drag rounded px-1 text-muted transition hover:text-fg" title="Minimizar al borde">—</button>
                <button onClick={() => bridge()?.hideWidget?.()} className="no-drag rounded px-1 text-muted transition hover:text-fg" title="Ocultar (Ctrl+Shift+P)">✕</button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="overflow-y-auto p-4">
        <p className="font-meta text-[10px] uppercase tracking-[0.22em] text-accent">¿Qué estás haciendo?</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onPaste={handlePaste}
          rows={2}
          placeholder="Investigando Intercom…  (pegá una captura con Ctrl+V)"
          className="mt-2 w-full resize-none border-b border-border bg-transparent pb-2 font-display text-lg leading-snug outline-none placeholder:text-muted/40 focus:border-accent"
        />

        {image && (
          <div className="relative mt-3 inline-block">
            <img src={image} alt="captura adjunta" className="h-16 w-auto rounded-lg border border-border object-cover" />
            <button
              onClick={() => setImage(null)}
              className="no-drag absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-bg text-[10px] text-muted hover:text-fg"
              title="Quitar captura"
            >
              ✕
            </button>
          </div>
        )}

        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <MiniChip onClick={captureScreen}>{shooting ? '…' : '📎 Captura'}</MiniChip>
          <MiniChip active={intent === 'BLOCKER'} onClick={() => setIntent((v) => (v === 'BLOCKER' ? null : 'BLOCKER'))}>⛔ Bloqueo</MiniChip>
          <MiniChip active={intent === 'DECISION'} onClick={() => setIntent((v) => (v === 'DECISION' ? null : 'DECISION'))}>◆ Decisión</MiniChip>
        </div>

        {!draft && (
          <button onClick={generate} disabled={loading || !canGenerate} className="mt-3 w-full rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40">
            {loading ? 'Generando…' : 'Generar bitácora'}
          </button>
        )}

        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}

        {draft && (
          <div className="pulso-reveal mt-3 rounded-xl border border-border bg-bg/50 p-3">
            <span className="font-meta text-[10px] uppercase tracking-[0.16em] text-muted">Sugerida · {draft.type}</span>
            <h3 className="font-display mt-1 text-base leading-snug">{draft.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">{draft.content}</p>
            {image && <img src={image} alt="" className="mt-2 h-14 w-auto rounded border border-border object-cover" />}
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

        {/* Tareas pendientes del proyecto en foco */}
        {focusProject && pending.length > 0 && (
          <div className="mt-4 border-t border-border/60 pt-3">
            <p className="font-meta text-[10px] uppercase tracking-[0.18em] text-muted">Pendientes</p>
            <ul className="mt-1.5 space-y-1">
              {pending.slice(0, 3).map((t) => (
                <li key={t.id}>
                  <button onClick={() => toggleTask(t.id)} className="no-drag group flex w-full items-center gap-2 text-left text-xs text-fg/90 transition hover:text-fg">
                    <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-muted transition group-hover:border-accent" />
                    <span className="truncate">{t.title}</span>
                    {t.priority === 'high' && <span className="ml-auto shrink-0 text-[#d98a5e]">●</span>}
                  </button>
                </li>
              ))}
            </ul>
            {pending.length > 3 && <p className="font-meta mt-1.5 text-[10px] text-muted">+{pending.length - 3} pendientes más</p>}
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

function MiniChip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
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
