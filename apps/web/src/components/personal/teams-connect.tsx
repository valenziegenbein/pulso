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
 * Pulso Teams desde el desktop. La URL normalmente ya viene configurada (horneada
 * al build por la organización): el caso feliz es UN botón — "Ir a Pulso Teams" —
 * que abre el server con tu sesión. Cambiar el servidor queda detrás de un link.
 */
export function TeamsConnect() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    const b = bridge();
    setIsDesktop(Boolean(b?.isDesktop));
    b?.getTeamsUrl?.().then((u) => setUrl(u ?? null));
  }, []);

  if (!isDesktop) return null;

  function open() {
    bridge()?.openTeams?.();
    setOpening(true);
    setTimeout(() => setOpening(false), 2000);
  }

  function saveAndOpen() {
    const clean = draft.trim().replace(/\/$/, '');
    if (!clean) return;
    bridge()?.setTeamsUrl?.(clean);
    setUrl(clean);
    setEditing(false);
    open();
  }

  return (
    <section className="mb-10">
      <h2 className="font-display text-xl">Pulso Teams</h2>
      <p className="mb-4 mt-1 text-sm text-muted">
        Tu trabajo en equipo vive en el server de tu organización. Personal sigue local en este equipo: podés ir y volver
        cuando quieras, sin reconfigurar nada.
      </p>

      {url && !editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={open}
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition hover:brightness-110"
          >
            {opening ? 'Abriendo…' : 'Ir a Pulso Teams →'}
          </button>
          <span className="font-meta text-xs text-muted">
            {url}{' '}
            <button
              onClick={() => {
                setDraft(url);
                setEditing(true);
              }}
              className="ml-1 text-accent underline-offset-2 transition hover:underline"
            >
              Cambiar servidor…
            </button>
          </span>
        </div>
      ) : (
        <div className="max-w-md">
          <p className="mb-2 text-sm text-muted">Pegá la URL de tu Pulso Teams (te la pasa tu organización):</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus={editing}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveAndOpen()}
              placeholder="https://pulso.tu-empresa.com"
              className="font-meta min-w-[16rem] flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition placeholder:text-muted/60 focus:border-accent"
            />
            <button
              onClick={saveAndOpen}
              disabled={!draft.trim()}
              className="shrink-0 rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
            >
              Guardar y abrir
            </button>
          </div>
          {url && (
            <button onClick={() => setEditing(false)} className="mt-3 text-sm text-muted transition hover:text-fg">
              ← Volver
            </button>
          )}
        </div>
      )}
    </section>
  );
}
