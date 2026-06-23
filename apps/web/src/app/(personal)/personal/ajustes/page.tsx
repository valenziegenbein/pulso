'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { usePersonal, type AiMode, type StorageTarget } from '@/lib/personal/store';
import { LocalAiSetup } from '@/components/personal/local-ai-setup';
import { CloudAiSetup } from '@/components/personal/cloud-ai-setup';

export default function AjustesPage() {
  const router = useRouter();
  const { storage, ai, setStorage, setAi, reset } = usePersonal();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
      <h1 className="font-display mb-8 text-4xl sm:text-5xl">Ajustes</h1>

      <Section title="Dónde guardar" hint="Pulso captura. Tu sistema favorito guarda.">
        <Choice<StorageTarget> value={storage} onChange={setStorage} options={[
          ['pulso', 'En Pulso', 'Base local simple.'],
          ['markdown', 'Carpeta Markdown', 'Obsidian, Logseq, Git.'],
          ['notion', 'Notion', 'A una base de Notion.'],
        ]} />
      </Section>

      <Section title="Inteligencia artificial" hint="La IA propone la bitácora. Vos siempre aprobás.">
        <Choice<AiMode> value={ai} onChange={setAi} options={[
          ['byok', 'API key propia', 'OpenAI, Anthropic, etc.'],
          ['local', 'IA local', 'Ollama, LM Studio, vLLM.'],
          ['none', 'Sin IA', 'Bitácora manual.'],
        ]} />
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
      </Section>

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
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<[NonNullable<T>, string, string]>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
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
