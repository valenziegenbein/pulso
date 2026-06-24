'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { WORKLOG_TYPE, type WorklogType } from '@pulso/shared';
import { saveWorklogDraftAction } from '@/server/actions/worklog';
import { WORKLOG_TYPE_LABEL } from '@/lib/labels';
import { inputCls, textareaCls } from '@/components/teams/ui';

interface Draft {
  type: WorklogType;
  title: string;
  content: string;
}

interface TaskContext {
  title?: string;
  teamName?: string;
}

async function downscale(src: Blob, maxW = 1000): Promise<string> {
  const url = URL.createObjectURL(src);
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
    if (!ctx) throw new Error('canvas_unavailable');
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function QuickWorklogWidget({ task, taskId }: { task?: TaskContext; taskId?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [image, setImage] = useState<string | null>(null);
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
        body: JSON.stringify({
          note,
          task,
          attachmentsHint: link ? [link] : undefined,
          images: image ? [{ dataUrl: image, mediaType: 'image/jpeg' }] : undefined,
        }),
      });
      if (!res.ok) {
        setError(res.status === 429 ? 'Demasiados pedidos. Proba en un momento.' : 'No se pudo generar la sugerencia.');
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
    setImage(null);
    setSaved(false);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await downscale(file);
      if (dataUrl.length > 2_000_000) {
        setError('La imagen es demasiado grande.');
        return;
      }
      setImage(dataUrl);
    } catch {
      setError('No se pudo adjuntar la imagen.');
    } finally {
      e.target.value = '';
    }
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
        attachment: image
          ? { url: image, kind: 'SCREENSHOT' }
          : link.trim()
            ? { url: link.trim(), kind: 'LINK' }
            : undefined,
      });
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
        <span className="pulso-beat inline-block text-accent">*</span>
        <h2 className="font-display text-lg leading-tight">Registrar avance rapido</h2>
      </div>
      <p className="mb-3 text-sm text-muted">Fallback web: texto, link o imagen manual. Para capturar avances sin cortar el flujo, usa Pulso Desktop.</p>

      {!taskId ? (
        <div className="rounded-xl border border-border bg-bg/40 p-4 text-sm text-muted">
          Necesitas una tarea asignada para registrar avances desde la web.
        </div>
      ) : (
        <>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Ej: investigando intercom para tickets internos"
        className={textareaCls}
      />
      <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Adjuntar link (opcional)" className={`${inputCls} mt-2`} />

      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-full border border-border px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-fg"
        >
          Adjuntar imagen
        </button>
        {image && (
          <>
            <img src={image} alt="Imagen adjunta" className="h-9 w-12 rounded border border-border object-cover" />
            <button type="button" onClick={() => setImage(null)} className="text-xs text-muted transition hover:text-fg">
              Quitar
            </button>
          </>
        )}
      </div>

      <button
        onClick={generate}
        disabled={loading || note.trim().length === 0}
        className="mt-3 w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
      >
        {loading ? 'Generando...' : 'Generar borrador'}
      </button>

      {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}

      {draft && (
        <div className="pulso-reveal mt-4 rounded-xl border border-border bg-bg/50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-meta text-[10px] uppercase tracking-[0.16em] text-accent">Borrador IA</span>
            <select
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as WorklogType })}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
            >
              {WORKLOG_TYPE.map((t) => (
                <option key={t} value={t}>{WORKLOG_TYPE_LABEL[t] ?? t}</option>
              ))}
            </select>
          </div>

          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={`${inputCls} mb-2 font-medium`} />
          <textarea value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} rows={4} className={textareaCls} />

          {saved ? (
            <p className="mt-3 text-xs text-[var(--ok)]">Guardado como borrador. Aprobalo para publicarlo.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button onClick={accept} disabled={saving} className="rounded-full bg-accent px-4 py-1.5 font-medium text-bg transition hover:brightness-110 disabled:opacity-40">
                {saving ? 'Guardando...' : 'Guardar avance'}
              </button>
              <button onClick={discard} className="rounded-full px-3 py-1.5 text-muted transition hover:text-fg">
                Descartar
              </button>
            </div>
          )}
        </div>
      )}
        </>
      )}

      <p className="font-meta mt-3 text-center text-[10px] uppercase tracking-[0.16em] text-muted/70">La IA propone. Vos decidis.</p>
    </section>
  );
}
