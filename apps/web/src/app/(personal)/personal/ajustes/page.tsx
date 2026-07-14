'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { usePersonal, type AiMode, type StorageTarget } from '@/lib/personal/store';
import { LocalAiSetup } from '@/components/personal/local-ai-setup';
import { CloudAiSetup } from '@/components/personal/cloud-ai-setup';
import { SemanticSearchSetup } from '@/components/personal/semantic-search-setup';
import { TeamsConnect } from '@/components/personal/teams-connect';
import { AccountAiSetup } from '@/components/personal/account-ai-setup';
import { TeamKnowledgeSync } from '@/components/personal/team-knowledge-sync';

type ShellBridge = { isDesktop?: boolean; chooseFolder?: () => Promise<string | null> };
function shell(): ShellBridge | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { pulso?: ShellBridge }).pulso : undefined;
}

export default function AjustesPage() {
  const router = useRouter();
  const { storage, storageDir, ai, setStorage, setStorageDir, setAi, reset } = usePersonal();
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => setIsDesktop(Boolean(shell()?.isDesktop)), []);

  async function pickFolder() {
    const dir = await shell()?.chooseFolder?.();
    if (dir) setStorageDir(dir);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
      <h1 className="font-display mb-8 text-4xl sm:text-5xl">Ajustes</h1>

      <Section title="Dónde guardar" hint="Pulso captura. Tu sistema favorito guarda.">
        <Choice<StorageTarget>
          value={storage}
          columns={2}
          onChange={(v) => {
            setStorage(v);
            if (v === 'markdown' && isDesktop && !storageDir) void pickFolder();
          }}
          options={[
          ['pulso', 'En Pulso', 'Base local simple.'],
          ['markdown', 'Carpeta Markdown', 'Obsidian, Logseq, Git.'],
        ]} />
        {storage === 'markdown' && (
          <p className="mt-3 text-sm text-muted">
            {storageDir ? (
              <>
                Carpeta por defecto: <span className="font-meta text-fg">{storageDir}</span>{' '}
                {isDesktop && (
                  <button onClick={pickFolder} className="ml-2 text-accent underline-offset-2 transition hover:underline">
                    Cambiar…
                  </button>
                )}
                <span className="mt-1 block text-xs text-muted/80">
                  Cada proyecto puede usar su propia carpeta (su bóveda, un repo…): Proyecto → Archivos.
                </span>
              </>
            ) : isDesktop ? (
              <button onClick={pickFolder} className="text-accent underline-offset-2 transition hover:underline">
                Elegí la carpeta destino…
              </button>
            ) : (
              'La carpeta se elige en la app de escritorio.'
            )}
          </p>
        )}
      </Section>

      <Section title="Inteligencia artificial" hint="La IA propone la bitácora. Vos siempre aprobás.">
        <Choice<AiMode> value={ai} onChange={setAi} columns={2} options={[
          ['account', 'Con mi cuenta Pulso', 'IA administrada. Prueba cerrada.'],
          ['byok', 'API key propia', 'OpenAI, Anthropic, etc.'],
          ['local', 'IA local', 'Ollama, LM Studio, vLLM.'],
          ['none', 'Sin IA', 'Bitácora manual.'],
        ]} />
        {ai === 'account' && (
          <div className="mt-4">
            <AccountAiSetup />
          </div>
        )}
        {ai === 'local' && (
          <div className="mt-4">
            <LocalAiSetup />
          </div>
        )}
        {ai === 'byok' && (
          <div className="mt-4">
            <CloudAiSetup />
          </div>
        )}
        {(ai === 'account' || ai === 'local' || ai === 'byok') && <SemanticSearchSetup />}
      </Section>

      <TeamsConnect />
      {ai === 'account' && <TeamKnowledgeSync />}

      <Section title="Datos" hint="Todo se guarda localmente en este equipo.">
        <button
          onClick={() => {
            reset();
            router.replace('/welcome');
          }}
          className="rounded-full border border-border px-4 py-2 text-sm text-muted transition hover:border-red-400/50 hover:text-red-300"
        >
          Reiniciar Pulso (borra datos locales)
        </button>
      </Section>
    </main>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-display text-xl">{title}</h2>
      <p className="mb-4 mt-1 text-sm text-muted">{hint}</p>
      {children}
    </section>
  );
}

function Choice<T extends string | null>({
  value,
  onChange,
  options,
  columns = 3,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<[NonNullable<T>, string, string]>;
  columns?: 2 | 3;
}) {
  return (
    <div className={`grid gap-3 ${columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
      {options.map(([key, title, desc]) => (
        <button
          key={key}
          onClick={() => onChange(key as T)}
          className={`rounded-2xl border bg-surface/50 p-4 text-left transition hover:-translate-y-0.5 hover:bg-surface ${
            value === key ? 'border-accent ring-1 ring-accent/40' : 'border-border hover:border-muted'
          }`}
        >
          <div className="font-display text-lg">{title}</div>
          <p className="mt-1 text-xs text-muted">{desc}</p>
        </button>
      ))}
    </div>
  );
}
