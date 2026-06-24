'use client';

import { useEffect, useState } from 'react';

/**
 * Muestra el pulso heurístico al instante y lo "afina" con IA en segundo plano
 * (LM Studio / Ollama local, u otro provider configurado). Nunca bloquea el
 * render: si no hay modelo o falla, se queda con el texto heurístico.
 */
export function PulseText({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [source, setSource] = useState<'heuristic' | 'ai'>('heuristic');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/teams/pulse')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { text?: string; source?: 'heuristic' | 'ai' } | null) => {
        if (alive && d?.text) {
          setText(d.text);
          setSource(d.source ?? 'heuristic');
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      <p className={`text-xl leading-relaxed text-fg/95 transition-opacity sm:text-[1.4rem] sm:leading-[1.7] ${loading ? 'opacity-80' : 'opacity-100'}`}>
        {text}
      </p>
      <p className="font-meta mt-3 text-[10px] uppercase tracking-[0.16em] text-muted/70">
        {loading ? (
          <span className="pulso-beat inline-block text-accent">✦</span>
        ) : (
          '✦'
        )}{' '}
        {loading ? 'afinando con IA…' : source === 'ai' ? 'traducido por IA' : 'resumen automático'}
      </p>
    </>
  );
}
