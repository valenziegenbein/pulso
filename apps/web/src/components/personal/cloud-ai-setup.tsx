'use client';

import { useState } from 'react';
import { AiError, CLOUD_PRESETS, verifyCloud, type CloudProvider } from '@/lib/personal/ai';
import { usePersonal } from '@/lib/personal/store';

type Status = 'idle' | 'verifying' | 'verified' | 'error';

const CLOUD_BASE: Record<CloudProvider, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
};

type SecretBridge = {
  isDesktop?: boolean;
  storePersonalAiKey?: (provider: CloudProvider, apiKey: string) => Promise<boolean>;
  deletePersonalAiKey?: (provider: CloudProvider) => Promise<boolean>;
};
function secretBridge(): SecretBridge | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { pulso?: SecretBridge }).pulso : undefined;
}

/**
 * Configura la IA cloud con API key propia (BYOK): OpenAI o Anthropic. La key se
 * guarda solo en este equipo. "Verificar" valida la key y trae tus modelos.
 * Lo usan el onboarding y Ajustes.
 */
export function CloudAiSetup() {
  const { aiConfig, setAiConfig } = usePersonal();

  const initial: CloudProvider = aiConfig?.provider === 'anthropic' ? 'anthropic' : 'openai';
  const [provider, setProvider] = useState<CloudProvider>(initial);
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<Status>(aiConfig?.hasApiKey ? 'verified' : 'idle');
  const [models, setModels] = useState<string[]>(aiConfig?.model ? [aiConfig.model] : []);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const preset = CLOUD_PRESETS[provider];

  function pickProvider(p: CloudProvider) {
    setProvider(p);
    setStatus('idle');
    setModels([]);
    setErrorMsg(null);
    setApiKey('');
    if (aiConfig?.provider === p && aiConfig.hasApiKey) {
      setStatus('verified');
      setModels(aiConfig.model ? [aiConfig.model] : []);
    }
  }

  async function verify() {
    if (!apiKey.trim()) return;
    setStatus('verifying');
    setErrorMsg(null);
    try {
      const found = await verifyCloud(provider, apiKey.trim());
      const list = found.length ? found : preset.fallbackModels;
      const stored = await secretBridge()?.storePersonalAiKey?.(provider, apiKey.trim());
      if (!stored) throw new Error('secure_storage_unavailable');
      setModels(list);
      setStatus('verified');
      const chosen = list.includes(aiConfig?.model ?? '') ? aiConfig!.model : list[0];
      if (chosen) setAiConfig({ provider, baseUrl: CLOUD_BASE[provider], model: chosen, hasApiKey: true });
      setApiKey('');
    } catch (e) {
      setStatus('error');
      setErrorMsg(
        e instanceof AiError && e.code === 'unauthorized'
          ? 'La API key no es válida o no tiene permisos.'
          : e instanceof AiError && e.code === 'network'
            ? 'No se pudo conectar. ¿Pulso está corriendo como app de escritorio?'
            : e instanceof Error && e.message === 'secure_storage_unavailable'
              ? 'No se pudo cifrar la key con el sistema operativo. BYOK requiere la app de escritorio.'
              : `No se pudo verificar con ${preset.label}. Probá de nuevo.`,
      );
    }
  }

  function choose(model: string) {
    setAiConfig({ provider, baseUrl: CLOUD_BASE[provider], model, hasApiKey: true });
  }

  async function removeKey() {
    await secretBridge()?.deletePersonalAiKey?.(provider);
    setAiConfig(null);
    setApiKey('');
    setModels([]);
    setStatus('idle');
    setErrorMsg(null);
  }

  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-5">
      {/* Proveedor */}
      <div className="flex gap-2">
        {(['openai', 'anthropic'] as const).map((p) => (
          <button
            key={p}
            onClick={() => pickProvider(p)}
            className={`flex-1 rounded-xl border px-4 py-2.5 text-sm transition ${
              provider === p ? 'border-accent text-accent' : 'border-border text-muted hover:border-muted hover:text-fg'
            }`}
          >
            {CLOUD_PRESETS[p].label}
          </button>
        ))}
      </div>

      {/* API key */}
      <div className="mt-4 flex items-end gap-3">
        <label className="flex-1">
          <span className="font-meta text-[11px] uppercase tracking-[0.18em] text-muted">API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setStatus('idle');
            }}
            placeholder={status === 'verified' ? 'Key guardada de forma segura' : preset.keyPlaceholder}
            autoComplete="off"
            spellCheck={false}
            className="mt-1.5 w-full rounded-xl border border-border bg-surface/60 px-3 py-2 font-meta text-sm outline-none focus:border-accent"
          />
        </label>
        <button
          onClick={verify}
          disabled={status === 'verifying' || !apiKey.trim()}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
        >
          {status === 'verifying' ? 'Verificando…' : 'Verificar'}
        </button>
      </div>
      <p className="mt-2 font-meta text-[11px] text-muted/70">
        Se cifra con el almacén seguro del sistema operativo ·{' '}
        <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="text-accent/80 underline-offset-2 hover:underline">
          conseguí una key
        </a>
      </p>

      {/* Resultado */}
      {status === 'verified' && models.length > 0 && (
        <div className="pulso-reveal mt-4">
          <span className="font-meta text-[11px] uppercase tracking-[0.18em] text-muted">Modelo</span>
          <select
            value={aiConfig?.model ?? models[0]}
            onChange={(e) => choose(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <p className="mt-2 text-sm text-accent">✓ Verificado · {models.length} modelo{models.length === 1 ? '' : 's'}</p>
          <button onClick={() => void removeKey()} className="mt-2 text-xs text-muted underline-offset-2 hover:text-red-300 hover:underline">
            Quitar API key de este equipo
          </button>
        </div>
      )}

      {errorMsg && <p className="mt-3 text-sm text-[#d98a5e]">{errorMsg}</p>}
    </div>
  );
}
