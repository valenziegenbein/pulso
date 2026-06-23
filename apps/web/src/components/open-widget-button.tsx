'use client';

type PulsoBridge = {
  isDesktop?: boolean;
  showWidget?: (mode?: 'personal' | 'teams') => void;
  showTeamsWidget?: () => void;
};
function desktopBridge(): PulsoBridge | undefined {
  return typeof window !== 'undefined'
    ? (window as unknown as { pulso?: PulsoBridge }).pulso
    : undefined;
}

/** Abre el widget de Pulso: en escritorio muestra la ventana flotante; en el
 *  navegador abre una ventana chica. */
export function OpenWidgetButton() {
  function open() {
    const bridge = desktopBridge();
    if (bridge?.isDesktop) {
      if (bridge.showTeamsWidget) bridge.showTeamsWidget();
      else bridge.showWidget?.('teams');
    } else {
      window.open('/widget', 'pulso-widget', 'width=400,height=720,menubar=no,toolbar=no,location=no,status=no');
    }
  }
  return (
    <button
      onClick={open}
      className="rounded-full border border-border px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-fg"
    >
      ⧉ Abrir widget
    </button>
  );
}
