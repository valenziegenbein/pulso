'use client';

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { WorklogType } from '@pulso/shared';
import { addBlockerAction } from '@/server/actions/tasks';
import { requestDecisionAction } from '@/server/actions/decisions';
import { saveWorklogDraftAction } from '@/server/actions/worklog';
import { VersionTag } from './version-tag';

interface FocusItem {
  id: string;
  title: string;
  status: string;
  teamId: string;
  teamName: string;
  blocked: boolean;
  lastNote: string | null;
  notificationLabel: 'nueva' | 'reciente' | null;
}

interface Draft {
  type: WorklogType;
  title: string;
  content: string;
}

type View = 'collapsed' | 'quick' | 'full';

type PulsoBridge = {
  isDesktop?: boolean;
  setView?: (v: View) => void;
  onWidgetView?: (handler: (v: View) => void) => () => void;
  hideWidget?: () => void;
  screenshot?: () => Promise<string | null>;
};

function desktopBridge(): PulsoBridge | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { pulso?: PulsoBridge }).pulso : undefined;
}

async function downscale(src: string | Blob, maxW = 1100): Promise<string> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
    const scale = Math.min(1, maxW / img.width);
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return typeof src === 'string' ? src : url;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return typeof src === 'string' ? src : url;
  } finally {
    if (typeof src !== 'string') URL.revokeObjectURL(url);
  }
}

function useElapsed(): string {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function PulsoWidget({ focus }: { focus: FocusItem[] }) {
  const elapsed = useElapsed();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [view, setView] = useState<View>('full');

  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [intentType, setIntentType] = useState<WorklogType | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>(focus[0]?.id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  const selected = focus.find((f) => f.id === selectedTaskId);
  const quick = view === 'quick';
  const notificationItems = focus.filter((item) => item.notificationLabel);
  const notificationCount = notificationItems.length;

  useEffect(() => {
    const bridge = desktopBridge();
    if (bridge?.isDesktop) {
      setIsDesktop(true);
      const initial = new URLSearchParams(window.location.search).get('view') as View | null;
      if (initial === 'collapsed' || initial === 'quick' || initial === 'full') setView(initial);
    }
  }, []);

  useEffect(() => {
    return desktopBridge()?.onWidgetView?.((next) => {
      if (next === 'collapsed' || next === 'quick' || next === 'full') setView(next);
    });
  }, []);

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
        // retry silently
      }
    }, 5000);
    return () => clearInterval(id);
  }, []);

  function changeView(next: View) {
    setView(next);
    desktopBridge()?.setView?.(next);
  }

  async function captureScreen() {
    const bridge = desktopBridge();
    if (bridge?.isDesktop && bridge.screenshot) {
      const shot = await bridge.screenshot();
      if (shot) setImage(await downscale(shot));
    } else {
      fileRef.current?.click();
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setImage(await downscale(file));
    e.target.value = '';
  }

  async function generate() {
    if (!note.trim()) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/worklog/suggest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          note,
          taskId: selected?.id,
          teamId: selected?.teamId,
          task: selected ? { title: selected.title, teamName: selected.teamName } : undefined,
          attachmentsHint: link ? [link] : undefined,
          images: image ? [{ dataUrl: image, mediaType: 'image/jpeg' }] : undefined,
        }),
      });
      if (!res.ok) {
        setError(res.status === 429 ? 'Demasiados pedidos. Proba en un momento.' : 'No se pudo generar la sugerencia.');
        return;
      }
      const data = (await res.json()) as { suggestion: Draft };
      setDraft(intentType ? { ...data.suggestion, type: intentType } : data.suggestion);
      if (view === 'quick') changeView('full');
    } catch {
      setError('Error de red.');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setDraft(null);
    setNote('');
    setLink('');
    setImage(null);
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
        attachment: image
          ? { url: image, kind: 'SCREENSHOT' }
          : link.trim()
            ? { url: link.trim(), kind: 'LINK' }
            : undefined,
      });

      if (draft.type === 'BLOCKER' && selected) {
        const form = new FormData();
        form.set('taskId', selected.id);
        form.set('teamId', selected.teamId);
        form.set('title', draft.title);
        form.set('description', draft.content);
        await addBlockerAction(form);
      }

      if (draft.type === 'DECISION' && selected) {
        const form = new FormData();
        form.set('taskId', selected.id);
        form.set('teamId', selected.teamId);
        form.set('title', draft.title);
        form.set('context', draft.content);
        await requestDecisionAction(form);
      }

      setSaved(true);
    } catch {
      setError('No se pudo guardar el avance.');
    } finally {
      setSaving(false);
    }
  }

  if (view === 'collapsed') {
    return (
      <div className="pulso-glass drag-region flex items-center gap-2 rounded-full border border-border px-3 py-1.5 shadow-2xl">
        <span className="text-emerald-400">o</span>
        <button onClick={() => changeView('full')} className="no-drag text-sm font-medium">Pulso</button>
        {notificationCount > 0 && (
          <button
            onClick={() => changeView('full')}
            className="pulso-beat no-drag ml-0.5 rounded-full border border-accent/50 bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent"
            title={`${notificationCount} tarea${notificationCount === 1 ? '' : 's'} reciente${notificationCount === 1 ? '' : 's'}`}
          >
            {notificationCount}
          </button>
        )}
        <button onClick={() => changeView('quick')} className="no-drag ml-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-bg" title="Bitacora rapida">+</button>
      </div>
    );
  }

  return (
    <div className="pulso-glass max-h-[calc(100vh-0.5rem)] overflow-y-auto rounded-2xl border border-border p-4 shadow-2xl">
      <div className="drag-region -m-4 mb-2 flex items-center justify-between px-4 pb-1 pt-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-accent">*</span> Pulso
          {notificationCount > 0 && (
            <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
              {notificationCount} nueva{notificationCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-muted">{elapsed}</span>
          {isDesktop && (
            <>
              {quick && <HeaderBtn title="Expandir" onClick={() => changeView('full')}>+</HeaderBtn>}
              <HeaderBtn title="Colapsar" onClick={() => changeView('collapsed')}>-</HeaderBtn>
              <HeaderBtn title="Ocultar" onClick={() => desktopBridge()?.hideWidget?.()}>x</HeaderBtn>
            </>
          )}
        </div>
      </div>

      <p className="mb-2 text-xs text-muted">Conta en una frase que estas haciendo.</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Ej: revisando el sistema de tickets internos"
        className="w-full resize-none rounded-lg border border-border bg-bg/60 p-2 text-sm outline-none focus:border-accent"
      />

      {!quick && (
        <select
          value={selectedTaskId ?? ''}
          onChange={(e) => setSelectedTaskId(e.target.value || undefined)}
          className="mt-2 w-full rounded-lg border border-border bg-bg/60 p-2 text-xs outline-none focus:border-accent"
        >
          <option value="">Tarea actual</option>
          {focus.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} - {item.teamName}{item.notificationLabel ? ` (${item.notificationLabel})` : ''}
            </option>
          ))}
        </select>
      )}

      {!quick && notificationItems.length > 0 && (
        <div className="mt-2 rounded-xl border border-accent/20 bg-accent/5 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">Reciente</p>
          <div className="space-y-1">
            {notificationItems.slice(0, 2).map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedTaskId(item.id)}
                className={`w-full rounded-lg px-2 py-1 text-left text-xs transition ${
                  item.id === selectedTaskId ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-bg/50 hover:text-fg'
                }`}
              >
                <span className="font-medium text-fg">{item.title}</span>
                <span className="ml-1 text-accent">({item.notificationLabel})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        <Chip label="Captura" compact={quick} active={!!image} onClick={captureScreen}>+</Chip>
        <Chip label="Bloqueo" compact={quick} active={intentType === 'BLOCKER'} onClick={() => toggleIntent('BLOCKER')}>!</Chip>
        <Chip label="Decision" compact={quick} active={intentType === 'DECISION'} onClick={() => toggleIntent('DECISION')}>?</Chip>
      </div>

      {!quick && (
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Adjuntar link opcional"
          className="mt-2 w-full rounded-lg border border-border bg-bg/60 p-2 text-xs outline-none focus:border-accent"
        />
      )}
      {image && !quick && <img src={image} alt="captura adjunta" className="mt-2 h-14 w-auto rounded border border-border object-cover" />}

      {!draft && (
        <button onClick={generate} disabled={loading || !note.trim()} className="mt-3 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-40">
          {loading ? 'Generando...' : 'Generar bitacora'}
        </button>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {!quick && draft && (
        <div className="mt-3 rounded-xl border border-border bg-bg/50 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-accent">*</span>
            <span className="text-xs font-medium">Bitacora sugerida</span>
            <span className="ml-auto rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">{draft.type}</span>
          </div>
          {editing ? (
            <>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mb-2 w-full rounded border border-border bg-surface p-2 text-sm font-medium outline-none focus:border-accent" />
              <textarea value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} rows={4} className="w-full resize-none rounded border border-border bg-surface p-2 text-sm outline-none focus:border-accent" />
            </>
          ) : (
            <>
              <p className="font-medium">{draft.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{draft.content}</p>
            </>
          )}
        </div>
      )}

      {!quick && draft && (
        <div className="mt-3">
          {saved ? (
            <p className="text-center text-xs text-emerald-400">Avance guardado como borrador. Aprobalo para publicarlo.</p>
          ) : (
            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-bg disabled:opacity-40">
                {saving ? 'Guardando...' : 'Guardar avance'}
              </button>
              <button onClick={() => setEditing((v) => !v)} className="rounded-lg border border-border px-3 py-2 text-sm hover:border-accent">{editing ? 'Listo' : 'Editar'}</button>
              <button onClick={reset} className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:border-muted">Descartar</button>
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-center text-[11px] text-muted">La IA propone. Vos aprobas. <VersionTag className="text-muted/60" /></p>
    </div>
  );

  function toggleIntent(type: WorklogType) {
    setIntentType((current) => (current === type ? null : type));
  }
}

function HeaderBtn({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} title={title} className="no-drag rounded px-1.5 text-muted hover:text-fg">{children}</button>;
}

function Chip({
  label,
  compact,
  active,
  onClick,
  children,
}: {
  label: string;
  compact: boolean;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button onClick={onClick} title={label} className={`flex items-center gap-1 rounded-full border px-2.5 py-1 ${active ? 'border-accent text-accent' : 'border-border text-muted hover:border-muted'}`}>
      <span>{children}</span>
      {!compact && <span>{label}</span>}
    </button>
  );
}
