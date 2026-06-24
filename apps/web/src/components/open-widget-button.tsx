'use client';

import { useEffect, useState } from 'react';

type PulsoBridge = {
  isDesktop?: boolean;
  showWidget?: (mode?: 'personal' | 'teams') => void;
  showTeamsWidget?: () => void;
};

const DESKTOP_DOWNLOAD_URL = 'https://github.com/valenziegenbein/pulso/releases/latest';

function desktopBridge(): PulsoBridge | undefined {
  return typeof window !== 'undefined'
    ? (window as unknown as { pulso?: PulsoBridge }).pulso
    : undefined;
}

export function OpenWidgetButton() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => setIsDesktop(Boolean(desktopBridge()?.isDesktop)), []);

  function open() {
    const bridge = desktopBridge();
    if (bridge?.isDesktop) {
      if (bridge.showTeamsWidget) bridge.showTeamsWidget();
      else bridge.showWidget?.('teams');
    } else {
      window.open(DESKTOP_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <button
      onClick={open}
      className="rounded-full border border-border px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-fg"
    >
      {isDesktop ? 'Abrir widget' : 'Descargar Pulso Desktop'}
    </button>
  );
}
