'use client';

import { useEffect } from 'react';

/** Avisa al shell de escritorio que hay sesión activa (esta página solo se
 *  renderiza autenticado). El shell usa esto para abrir el widget tras login,
 *  de forma confiable (las navegaciones de Next son client-side / "soft"). */
export function AuthBridge() {
  useEffect(() => {
    (window as unknown as { pulso?: { authState?: (s: string) => void } }).pulso?.authState?.('authed');
  }, []);
  return null;
}
