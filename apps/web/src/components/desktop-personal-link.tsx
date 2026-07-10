'use client';

import { useEffect, useState } from 'react';

type Bridge = { isDesktop?: boolean; backToPersonal?: () => void };
function bridge(): Bridge | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { pulso?: Bridge }).pulso : undefined;
}

/**
 * "Ir a Personal": solo aparece cuando la página corre dentro de la ventana
 * Teams del desktop. Cierra esa ventana y vuelve al espacio Personal local,
 * sin tocar la sesión ni la configuración (ida y vuelta libre).
 */
export function DesktopPersonalLink({ label = 'Ir a Personal', className }: { label?: string; className?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const b = bridge();
    setShow(Boolean(b?.isDesktop && b?.backToPersonal));
  }, []);
  if (!show) return null;
  return (
    <button
      onClick={() => bridge()?.backToPersonal?.()}
      className={className ?? 'text-xs text-muted transition hover:text-fg'}
    >
      {label}
    </button>
  );
}
