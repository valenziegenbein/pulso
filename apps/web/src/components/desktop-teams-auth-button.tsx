'use client';

import { useEffect, useState } from 'react';

type DesktopBridge = { beginTeamsAuth?: () => void };

export function DesktopTeamsAuthButton() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    setAvailable(Boolean((window as unknown as { pulso?: DesktopBridge }).pulso?.beginTeamsAuth));
  }, []);
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={() => (window as unknown as { pulso?: DesktopBridge }).pulso?.beginTeamsAuth?.()}
      className="mt-3 w-full rounded-xl border border-border px-3 py-2.5 text-sm text-fg transition hover:border-accent"
    >
      Conectar con el navegador del sistema
    </button>
  );
}
