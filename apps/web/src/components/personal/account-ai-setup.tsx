'use client';

import { useCallback, useEffect, useState } from 'react';

type AccountStatus = {
  authenticated?: boolean;
  enabled?: boolean;
  reason?: 'authentication_required' | 'not_allowlisted' | 'provider_unavailable';
  model?: string;
};

type BridgeResult<T> = { ok: true; data: T } | { ok: false; status?: number; error?: string };
type AccountBridge = {
  isDesktop?: boolean;
  connectAccount?: () => Promise<{ ok: boolean; error?: string }>;
  accountAiStatus?: () => Promise<BridgeResult<AccountStatus>>;
};

function bridge(): AccountBridge | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { pulso?: AccountBridge }).pulso : undefined;
}

export function AccountAiSetup() {
  const [status, setStatus] = useState<'checking' | 'ready' | 'signed-out' | 'waiting' | 'unavailable' | 'browser'>('checking');
  const [model, setModel] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const shell = bridge();
    if (!shell?.isDesktop || !shell.accountAiStatus) {
      setStatus('browser');
      return;
    }
    setStatus('checking');
    setMessage(null);
    try {
      const result = await shell.accountAiStatus();
      if (!result.ok) {
        setStatus(result.status === 401 ? 'signed-out' : 'unavailable');
        return;
      }
      if (result.data.enabled) {
        setStatus('ready');
        setModel(result.data.model ?? null);
      } else if (!result.data.authenticated || result.data.reason === 'authentication_required') {
        setStatus('signed-out');
      } else if (result.data.reason === 'not_allowlisted') {
        setStatus('waiting');
      } else {
        setStatus('unavailable');
      }
    } catch {
      setStatus('unavailable');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function connect() {
    const shell = bridge();
    if (!shell?.connectAccount) return;
    setStatus('checking');
    setMessage('Completá la autorización en el navegador…');
    try {
      const result = await shell.connectAccount();
      if (!result.ok) {
        setStatus('signed-out');
        setMessage('No se pudo conectar la cuenta. Podés reintentarlo.');
        return;
      }
      await refresh();
    } catch {
      setStatus('signed-out');
      setMessage('No se pudo conectar la cuenta. Podés reintentarlo.');
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-lg">IA administrada por Pulso</p>
          <p className="mt-1 text-sm text-muted">Sin API key propia ni modelo local. Tus borradores siguen requiriendo aprobación.</p>
        </div>
        <span className="font-meta shrink-0 rounded-full border border-accent/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-accent">
          Prueba cerrada
        </span>
      </div>

      {status === 'checking' && <p className="mt-4 text-sm text-muted">Comprobando tu cuenta…</p>}
      {status === 'browser' && (
        <p className="mt-4 text-sm text-muted">Esta opción se conecta de forma segura desde la app de escritorio.</p>
      )}
      {status === 'signed-out' && (
        <div className="mt-4">
          <button onClick={() => void connect()} className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-bg transition hover:brightness-110">
            Conectar mi cuenta Pulso
          </button>
          <p className="mt-2 text-xs text-muted">La autorización se abre en tu navegador. La app no recibe tu contraseña.</p>
        </div>
      )}
      {status === 'ready' && (
        <p className="mt-4 text-sm text-accent">✓ Cuenta conectada · acceso Personal AI habilitado{model ? ` · ${model}` : ''}</p>
      )}
      {status === 'waiting' && (
        <p className="mt-4 text-sm text-[#d9a45e]">Tu cuenta está conectada, pero todavía no está incluida en la whitelist de Personal AI.</p>
      )}
      {status === 'unavailable' && (
        <div className="mt-4">
          <p className="text-sm text-[#d98a5e]">Personal AI no está disponible en este momento.</p>
          <button onClick={() => void refresh()} className="mt-2 text-sm text-accent underline-offset-2 hover:underline">Reintentar</button>
        </div>
      )}
      {message && <p className="mt-3 text-xs text-muted">{message}</p>}
    </div>
  );
}
