'use client';

import { useState } from 'react';
import { usePersonal } from '@/lib/personal/store';

/**
 * Activa/desactiva la búsqueda semántica (embeddings) sobre la bóveda del
 * proyecto. Vive debajo de la config de IA en Ajustes: reusa el proveedor ya
 * configurado (nada de modelos embebidos — así el desktop sigue liviano).
 *
 * Reglas de consentimiento:
 * - Anthropic no ofrece embeddings → deshabilitado, con motivo.
 * - Cloud (OpenAI): activar exige una confirmación EXPLÍCITA aparte del toggle,
 *   porque indexar sube el CONTENIDO de las notas al proveedor (no solo
 *   extractos chicos, como en el borrador) — a diferencia de esos extractos,
 *   este es un consentimiento distinto y más fuerte.
 * - Local: activar es directo (todo queda en la máquina), solo pide el nombre
 *   del modelo de embeddings (uno separado del modelo de chat).
 */
export function SemanticSearchSetup() {
  const { ai, aiConfig, embeddingsEnabled, setEmbeddingsEnabled, setAiConfig } = usePersonal();
  const [confirming, setConfirming] = useState(false);
  const [modelDraft, setModelDraft] = useState(aiConfig?.embeddingsModel ?? '');

  if (ai !== 'account' && ai !== 'local' && ai !== 'byok') return null;
  if (ai !== 'account' && !aiConfig) return null;

  const isManaged = ai === 'account';
  const isAnthropic = aiConfig?.provider === 'anthropic';
  const isCloud = isManaged || aiConfig?.provider === 'openai' || isAnthropic;
  const isLocal = !isCloud;
  const hasEmbeddingsModel = isLocal ? Boolean(aiConfig?.embeddingsModel?.trim()) : true;

  function enableCloud() {
    setEmbeddingsEnabled(true);
    setConfirming(false);
  }

  function saveLocalModel() {
    const model = modelDraft.trim();
    if (!model) return;
    setAiConfig({ ...aiConfig!, embeddingsModel: model });
    setEmbeddingsEnabled(true);
  }

  function disable() {
    setEmbeddingsEnabled(false);
    setConfirming(false);
  }

  return (
    <div className="mt-5 rounded-2xl border border-border bg-surface/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-lg">Búsqueda semántica en tus notas</h3>
          <p className="mt-1 text-sm text-muted">
            Encuentra notas relacionadas aunque no compartan las mismas palabras (no solo coincidencia exacta). Mejora el
            contexto que la IA usa para escribir tu bitácora.
          </p>
        </div>
        {!isAnthropic && (
          <button
            onClick={() => {
              if (embeddingsEnabled) return disable();
              if (isCloud) setConfirming(true);
              else if (hasEmbeddingsModel) setEmbeddingsEnabled(true);
            }}
            role="switch"
            aria-checked={embeddingsEnabled}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${embeddingsEnabled ? 'bg-accent' : 'bg-border'}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-bg transition ${embeddingsEnabled ? 'left-[22px]' : 'left-0.5'}`}
            />
          </button>
        )}
      </div>

      {isAnthropic && (
        <p className="mt-3 text-sm text-[#d98a5e]">
          Tu proveedor actual (Anthropic) no ofrece embeddings. Cambiá a IA administrada por Pulso, OpenAI o a un servidor local (LM Studio/Ollama)
          para activar esta función — mientras tanto, el asistente sigue buscando por palabra clave.
        </p>
      )}

      {/* Local: pide el modelo de embeddings (distinto al de chat) */}
      {isLocal && !isAnthropic && (embeddingsEnabled || !hasEmbeddingsModel) && (
        <div className="mt-4">
          <span className="font-meta text-[11px] uppercase tracking-[0.18em] text-muted">Modelo de embeddings</span>
          <div className="mt-1.5 flex gap-2">
            <input
              value={modelDraft}
              onChange={(e) => setModelDraft(e.target.value)}
              placeholder="nomic-embed-text"
              className="flex-1 rounded-xl border border-border bg-surface/60 px-3 py-2 font-meta text-sm outline-none focus:border-accent"
            />
            <button
              onClick={saveLocalModel}
              disabled={!modelDraft.trim()}
              className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
          <p className="mt-2 text-xs text-muted/80">
            Cargalo en {aiConfig?.provider === 'ollama' ? 'Ollama' : 'LM Studio'} por separado de tu modelo de chat (p. ej.
            nomic-embed-text o bge-small). Todo esto queda en tu máquina — nada viaja afuera.
          </p>
        </div>
      )}

      {/* Cloud: confirmación explícita antes de activar */}
      {isCloud && !isAnthropic && confirming && !embeddingsEnabled && (
        <div className="pulso-reveal mt-4 rounded-xl border border-[#d98a5e]/40 bg-bg/40 p-4">
          <p className="text-sm text-fg">
            Al activar esto, el <strong>contenido de tus notas</strong> (no solo un extracto chico como en el borrador) se
            envía {isManaged ? 'a Pulso Cloud y al proveedor administrado' : 'a OpenAI'} para generar los vectores de búsqueda.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={enableCloud} className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-bg">
              Entiendo, activar
            </button>
            <button onClick={() => setConfirming(false)} className="rounded-full px-3 py-1.5 text-sm text-muted transition hover:text-fg">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {embeddingsEnabled && (
        <p className="mt-3 text-xs text-muted/80">
          La primera vez que indexás la carpeta de un proyecto puede tardar unos segundos (según su tamaño); después es
          instantáneo. Se indexa a pedido, desde cada proyecto: <span className="text-fg">Archivos → Indexar ahora</span>.
        </p>
      )}
    </div>
  );
}
