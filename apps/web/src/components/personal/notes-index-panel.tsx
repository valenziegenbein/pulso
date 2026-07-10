'use client';

import { useEffect, useRef, useState } from 'react';
import { embeddingsModelFor, embedTexts } from '@/lib/personal/ai';
import type { AiConfig } from '@/lib/personal/store';

type Chunk = { id: string; file: string; heading: string; text: string };
type Bridge = {
  embeddingsStatus?: (payload: { dir: string; model: string }) => Promise<{ total: number; indexed: number }>;
  embeddingsPending?: (payload: { dir: string; model: string }) => Promise<{ pending: Chunk[]; total: number; indexed: number }>;
  embeddingsSave?: (payload: { dir: string; model: string; entries: { id: string; vector: number[] }[] }) => Promise<{ saved: number }>;
};
function bridge(): Bridge | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { pulso?: Bridge }).pulso : undefined;
}

const BATCH_SIZE = 16;

/**
 * Estado de indexado semántico de la carpeta de un proyecto + botón para
 * indexar a pedido. Acción explícita (no automática en segundo plano): el
 * costo/demora de indexar debe ser visible, no una sorpresa.
 */
export function NotesIndexPanel({ dir, aiConfig }: { dir: string; aiConfig: AiConfig }) {
  const model = embeddingsModelFor(aiConfig);
  const [status, setStatus] = useState<{ total: number; indexed: number } | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);

  async function refreshStatus() {
    if (!model) return;
    const s = await bridge()?.embeddingsStatus?.({ dir, model });
    if (s) setStatus(s);
  }

  async function indexNow() {
    if (!model || indexing) return;
    setIndexing(true);
    setError(null);
    setProgress(0);
    try {
      const { pending, total } = (await bridge()?.embeddingsPending?.({ dir, model })) ?? { pending: [], total: 0 };
      let done = 0;
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = pending.slice(i, i + BATCH_SIZE);
        const vectors = await embedTexts(
          batch.map((c) => `${c.heading}\n${c.text}`),
          aiConfig,
        );
        const entries = batch.map((c, idx) => ({ id: c.id, vector: vectors[idx] })).filter((e): e is { id: string; vector: number[] } => !!e.vector);
        await bridge()?.embeddingsSave?.({ dir, model, entries });
        done += batch.length;
        setProgress(done);
      }
      setStatus({ total, indexed: total });
    } catch {
      setError('No se pudo indexar. Revisá tu proveedor de embeddings en Ajustes.');
    } finally {
      setIndexing(false);
    }
  }

  useEffect(() => {
    autoTried.current = false;
    setStatus(null);
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir, model]);

  // Primera vez (nada indexado todavía): dispara el indexado solo, una vez.
  useEffect(() => {
    if (autoTried.current || !status) return;
    autoTried.current = true;
    if (status.indexed === 0 && status.total > 0) void indexNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (!model) return null;

  return (
    <div className="mt-4 border-t border-border/60 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {status ? (
            indexing ? (
              <>Indexando… {progress}/{status.total - status.indexed + progress}</>
            ) : status.total === 0 ? (
              'Sin notas todavía para indexar.'
            ) : status.indexed === status.total ? (
              <>Índice semántico al día · {status.total} notas</>
            ) : (
              <>Indexado: {status.indexed}/{status.total} notas</>
            )
          ) : (
            'Consultando índice…'
          )}
        </p>
        <button
          onClick={indexNow}
          disabled={indexing || !status || status.total === 0}
          className="shrink-0 rounded-full border border-border px-3.5 py-1.5 text-xs text-muted transition hover:border-accent hover:text-fg disabled:opacity-40"
        >
          {indexing ? 'Indexando…' : 'Indexar ahora'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-[#d98a5e]">{error}</p>}
    </div>
  );
}
