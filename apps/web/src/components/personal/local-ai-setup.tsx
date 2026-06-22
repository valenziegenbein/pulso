'use client';

import { useState } from 'react';
import { AiError, listModels, PROVIDER_PRESETS } from '@/lib/personal/ai';
import { usePersonal, type AiProvider } from '@/lib/personal/store';

type Status = 'idle' | 'connecting' | 'connected' | 'error';

/**
 * Configura la IA local (LM Studio / Ollama): elegís proveedor + puerto,
 * "Conectar" verifica y trae los modelos cargados, elegís uno y queda andando.
 * Persiste en el store (aiConfig). Lo usan el onboarding y Ajustes.
 */
export function LocalAiSetup() {
  const { aiConfig, setAiConfig } = usePersonal();

  const initialProvider: Exclude<AiProvider, 'custom'> =
    aiConfig?.provider === 'ollama' ? 'ollama' : 'lmstudio';
  const [provider, setProvider] = useState<Exclude<AiProvider, 'custom'>>(initialProvider);
  const [port, setPort] = useState<number>(() => {
    const fromUrl = aiConfig?.baseUrl?.match(/:(\d+)/)?.[1];
    return fromUrl ? Number(fromUrl) : PROVIDER_PRESETS[initialProvider].port;
  });
  const [status, setStatus] = useState<Status>(aiConfig ? 'connected' : 'idle');
  const [models, setModels] = useState<string[]>(aiConfig?.model ? [aiConfig.model] : []);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const preset = PROVIDER_PRESETS[provider];
  const baseUrl = preset.baseUrl(port);

  function pickProvider(p: Exclude<AiProvider, 'custom'>) {
    setProvider(p);
    setPort(PROVIDER_PRESETS[p].port);
    setStatus('idle');
    setModels([]);
    setErrorMsg(null);
  }

  async function connect() {
    setStatus('connecting');
    setErrorMsg(null);
    try {
      const found = await listModels(baseUrl);
      setModels(found);
      setStatus('connected');
      // Si ya había un modelo válido lo conservamos; si no, tomamos el primero.
      const chosen = found.includes(aiConfig?.model ?? '') ? aiConfig!.model : found[0];
      if (chosen) setAiConfig({ provider, baseUrl, model: chosen });
      else setErrorMsg(`Conectó, pero no hay modelos cargados en ${preset.label}.`);
    } catch (e) {
      setStatus('error');
      setErrorMsg(
        e instanceof AiError && e.code === 'network'
          ? 'No se pudo conectar. ¿Pulso está corriendo como app de escritorio?'
          : `No respondió en localhost:${port}. ${preset.hint}`,
      );
    }
  }

  function choose(model: string) {
    setAiConfig({ provider, baseUrl, model });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface/40 p-5">
      {/* Proveedor */}
      <div className="flex gap-2">
        {(['lmstudio', 'ollama'] as const).map((p) => (
          <button
            key={p}
            onClick={() => pickProvider(p)}
            className={`flex-1 rounded-xl border px-4 py-2.5 text-sm transition ${
              provider === p ? 'border-accent text-accent' : 'border-border text-muted hover:border-muted hover:text-fg'
            }`}
          >
            {PROVIDER_PRESETS[p].label}
          </button>
        ))}
      </div>

      {/* Puerto */}
      <div className="mt-4 flex items-end gap-3">
        <label className="flex-1">
          <span className="font-meta text-[11px] uppercase tracking-[0.18em] text-muted">Puerto</span>
          <input
            type="number"
            value={port}
            onChange={(e) => {
              setPort(Number(e.target.value));
              setStatus('idle');
            }}
            className="mt-1.5 w-full rounded-xl border border-border bg-surface/60 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <button
          onClick={connect}
          disabled={status === 'connecting' || !port}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
        >
          {status === 'connecting' ? 'Conectando…' : 'Conectar'}
        </button>
      </div>
      <p className="mt-2 font-meta text-[11px] text-muted/70">{baseUrl}/chat/completions</p>

      {/* Resultado */}
      {status === 'connected' && models.length > 0 && (
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
          <p className="mt-2 text-sm text-accent">✓ Conectado · {models.length} modelo{models.length === 1 ? '' : 's'} disponible{models.length === 1 ? '' : 's'}</p>
        </div>
      )}

      {errorMsg && <p className="mt-3 text-sm text-[#d98a5e]">{errorMsg}</p>}
    </div>
  );
}
