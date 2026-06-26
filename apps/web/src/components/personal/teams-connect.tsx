'use client';

import { useEffect, useState } from 'react';

type Bridge = {
  isDesktop?: boolean;
  getTeamsUrl?: () => Promise<string | null>;
  setTeamsUrl?: (url: string) => void;
  openTeams?: () => void;
};
function bridge(): Bridge | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { pulso?: Bridge }).pulso : undefined;
}

/**
 * Conexión a Pulso Teams (web) desde el desktop. El modo Personal es local; para
 * Teams, el desktop abre el server remoto (mismo dato que la web, en vivo).
 * Solo se muestra en la app de escritorio.
 */
export function TeamsConnect() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [url, setUrl] = useState('');
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    const b = bridge();
    setIsDesktop(Boolean(b?.isDesktop));
    b?.getTeamsUrl?.().then((u) => {
      if (u) setUrl(u);
    });
  }, []);

  if (!isDesktop) return null;

  function connect() {
    const b = bridge();
    const clean = url.trim();
    if (!b || !clean) return;
    b.setTeamsUrl?.(clean);
    b.openTeams?.();
    setOpening(true);
    setTimeout(() => setOpening(false), 2000);
  }

  return (
    <section className="mb-10">
      <h2 className="font-display text-xl">Pulso Teams (web)</h2>
      <p className="mb-4 mt-1 text-sm text-muted">
        Tu trabajo en equipo vive en el server de tu organización. Conectá la URL y se abre acá mismo, con tu cuenta. (Personal sigue local en este equipo.)
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && connect()}
          placeholder="https://pulso.tu-empresa.com"
          className="font-meta min-w-[16rem] flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition placeholder:text-muted/60 focus:border-accent"
        />
        <button
          onClick={connect}
          disabled={!url.trim()}
          className="shrink-0 rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
        >
          {opening ? 'Abriendo…' : 'Conectar y abrir'}
        </button>
      </div>
    </section>
  );
}
