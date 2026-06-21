'use client';

import { useEffect, useState } from 'react';

/** Leyenda chiquita con la versión de la app de escritorio (para verificar
 *  que los auto-updates aplicaron). En el navegador no muestra nada. */
export function VersionTag({ className = '' }: { className?: string }) {
  const [version, setVersion] = useState('');
  useEffect(() => {
    const v = (window as unknown as { pulso?: { version?: string } }).pulso?.version;
    if (v) setVersion(v);
  }, []);
  if (!version) return null;
  return <span className={className}>v{version}</span>;
}
