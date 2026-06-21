'use client';

import { useEffect, useState } from 'react';
import { VersionTag } from './version-tag';

type PulsoBridge = { isDesktop?: boolean; hideWidget?: () => void };
function desktopBridge(): PulsoBridge | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { pulso?: PulsoBridge }).pulso : undefined;
}

/** Estado compacto del widget cuando no hay sesión. La ventana flotante nunca
 *  muestra el login completo: el inicio de sesión ocurre en la ventana principal
 *  (la cookie es compartida, así que al loguearte ahí el widget se sincroniza). */
export function WidgetSignedOut() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    setIsDesktop(Boolean(desktopBridge()?.isDesktop));
  }, []);

  // Auto-sincronización: si el usuario inicia sesión en la ventana principal,
  // la cookie compartida hace que /api/me devuelva authed → recargamos para
  // mostrar el widget real, sin que tenga que reabrirlo.
  useEffect(() => {
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/me', { cache: 'no-store' });
        const data = (await res.json()) as { authed?: boolean };
        if (!cancelled && data.authed) {
          clearInterval(id);
          window.location.reload();
        }
      } catch {
        /* reintenta en el próximo tick */
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="pulso-glass w-[360px] rounded-2xl border border-border p-4 shadow-2xl">
      <div className="drag-region -m-4 mb-2 flex items-center justify-between px-4 pb-2 pt-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-accent">✦</span> Pulso
        </div>
        {isDesktop && (
          <button
            onClick={() => desktopBridge()?.hideWidget?.()}
            className="no-drag rounded px-1.5 text-muted hover:text-fg"
            title="Ocultar"
          >
            ✕
          </button>
        )}
      </div>
      <p className="text-sm text-muted">
        Iniciá sesión en la ventana principal de Pulso para registrar avances desde acá.
      </p>
      <VersionTag className="mt-3 block text-center text-[10px] text-muted/70" />
    </div>
  );
}
