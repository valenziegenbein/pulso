'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePersonal, type AiMode, type StorageTarget } from '@/lib/personal/store';

const STEPS = ['intro', 'mode', 'name', 'project', 'storage', 'ai', 'done'] as const;

export function Onboarding() {
  const router = useRouter();
  const { setName, addProject, setStorage, setAi, completeOnboarding } = usePersonal();

  const [i, setI] = useState(0);
  const [name, setNameLocal] = useState('');
  const [projName, setProjName] = useState('');
  const [projCtx, setProjCtx] = useState('');
  const [storage, setStorageLocal] = useState<StorageTarget>(null);
  const [ai, setAiLocal] = useState<AiMode>(null);

  const step = STEPS[i];
  const go = (n: number) => setI((v) => Math.min(Math.max(v + n, 0), STEPS.length - 1));

  function finish() {
    if (name.trim()) setName(name.trim());
    if (projName.trim()) addProject({ name: projName.trim(), context: projCtx.trim() || undefined });
    setStorage(storage);
    setAi(ai);
    completeOnboarding();
    router.push('/personal');
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-8">
      {/* Cabecera */}
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="pulso-beat inline-block text-accent">✦</span> Pulso
        </div>
        <span className="font-meta text-xs text-muted">
          {String(i + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
        </span>
      </header>

      {/* Contenido del paso (re-anima al cambiar) */}
      <div key={step} className="pulso-reveal mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-10">
        {step === 'intro' && (
          <div>
            <p className="font-meta mb-4 text-xs uppercase tracking-[0.2em] text-accent">Configuremos tu Pulso</p>
            <h1 className="font-display text-5xl leading-[1.05] sm:text-6xl">
              Hacé visible el trabajo<br />que no se ve.
            </h1>
            <p className="mt-5 max-w-md text-lg text-muted">
              Pulso captura tus avances en una frase y los convierte en bitácora útil. Vos escribís; Pulso ordena.
            </p>
            <button onClick={() => go(1)} className="mt-8 rounded-full bg-accent px-7 py-3 font-medium text-bg transition hover:brightness-110">
              Empezar
            </button>
          </div>
        )}

        {step === 'mode' && (
          <div>
            <h1 className="font-display text-4xl sm:text-5xl">¿Cómo vas a usar Pulso?</h1>
            <p className="mt-3 text-muted">Misma herramienta, dos formas de trabajar.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <OptionCard
                title="Para mí"
                desc="Notas, proyectos propios, bitácora. Local, sin cuenta. Tus datos son tuyos."
                badge="Personal"
                onClick={() => go(1)}
              />
              <OptionCard
                title="Con mi equipo"
                desc="Equipos, personas, tareas, comunicación y resultados. Requiere cuenta."
                badge="Teams"
                onClick={() => router.push('/login')}
              />
            </div>
          </div>
        )}

        {step === 'name' && (
          <div>
            <h1 className="font-display text-4xl sm:text-5xl">¿Cómo querés que te llame?</h1>
            <input
              autoFocus
              value={name}
              onChange={(e) => setNameLocal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && go(1)}
              placeholder="Tu nombre o alias"
              className="mt-8 w-full border-b border-border bg-transparent pb-2 font-display text-3xl outline-none placeholder:text-muted/50 focus:border-accent"
            />
            <p className="mt-4 text-sm text-muted">Sin cuenta. Sin fricción. Podés crear una después si querés sincronizar o usar Teams.</p>
            <StepNav onBack={() => go(-1)} onNext={() => go(1)} nextDisabled={!name.trim()} />
          </div>
        )}

        {step === 'project' && (
          <div>
            <h1 className="font-display text-4xl sm:text-5xl">Tu primer proyecto</h1>
            <p className="mt-3 text-muted">Algo en lo que estés trabajando. Esto le da contexto a tu bitácora.</p>
            <input
              autoFocus
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
              placeholder="Nombre del proyecto"
              className="mt-7 w-full border-b border-border bg-transparent pb-2 font-display text-2xl outline-none placeholder:text-muted/50 focus:border-accent"
            />
            <textarea
              value={projCtx}
              onChange={(e) => setProjCtx(e.target.value)}
              rows={3}
              placeholder="¿De qué trata? (opcional)"
              className="mt-5 w-full resize-none rounded-xl border border-border bg-surface/60 p-3 text-sm outline-none placeholder:text-muted/50 focus:border-accent"
            />
            <StepNav onBack={() => go(-1)} onNext={() => go(1)} nextLabel={projName.trim() ? 'Continuar' : 'Lo hago después'} />
          </div>
        )}

        {step === 'storage' && (
          <div>
            <h1 className="font-display text-4xl sm:text-5xl">¿Dónde guardás tus avances?</h1>
            <p className="mt-3 text-muted">Pulso captura. Tu sistema favorito guarda.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <OptionCard small title="En Pulso" desc="Base local simple." selected={storage === 'pulso'} onClick={() => setStorageLocal('pulso')} />
              <OptionCard small title="Carpeta Markdown" desc="Obsidian, Logseq, Git." selected={storage === 'markdown'} onClick={() => setStorageLocal('markdown')} />
              <OptionCard small title="Notion" desc="A una base de Notion." selected={storage === 'notion'} onClick={() => setStorageLocal('notion')} />
            </div>
            <StepNav onBack={() => go(-1)} onNext={() => go(1)} nextLabel={storage ? 'Continuar' : 'Configurar después'} />
          </div>
        )}

        {step === 'ai' && (
          <div>
            <h1 className="font-display text-4xl sm:text-5xl">¿Cómo querés usar la IA?</h1>
            <p className="mt-3 text-muted">La IA propone la bitácora. Vos siempre aprobás.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <OptionCard small title="API key propia" desc="OpenAI, Anthropic, etc." selected={ai === 'byok'} onClick={() => setAiLocal('byok')} />
              <OptionCard small title="IA local" desc="Ollama, LM Studio, vLLM." selected={ai === 'local'} onClick={() => setAiLocal('local')} />
              <OptionCard small title="Sin IA por ahora" desc="Bitácora manual." selected={ai === 'none'} onClick={() => setAiLocal('none')} />
            </div>
            <StepNav onBack={() => go(-1)} onNext={() => go(1)} nextLabel={ai ? 'Continuar' : 'Decidir después'} />
          </div>
        )}

        {step === 'done' && (
          <div>
            <p className="font-meta mb-4 text-xs uppercase tracking-[0.2em] text-accent">Todo listo</p>
            <h1 className="font-display text-5xl sm:text-6xl">{name.trim() ? `Listo, ${name.trim()}.` : 'Listo.'}</h1>
            <p className="mt-5 max-w-md text-lg text-muted">
              Tu taller está armado. Abrí Pulso y, cuando quieras capturar algo, solo escribí una frase.
            </p>
            <button onClick={finish} className="mt-8 rounded-full bg-accent px-7 py-3 font-medium text-bg transition hover:brightness-110">
              Entrar a Pulso →
            </button>
          </div>
        )}
      </div>

      {/* Puntos de progreso */}
      <footer className="mx-auto flex w-full max-w-2xl items-center justify-center gap-2">
        {STEPS.map((s, idx) => (
          <span
            key={s}
            className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-6 bg-accent' : 'w-1.5 bg-border'}`}
          />
        ))}
      </footer>
    </main>
  );
}

function OptionCard({
  title,
  desc,
  badge,
  small,
  selected,
  onClick,
}: {
  title: string;
  desc: string;
  badge?: string;
  small?: boolean;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group rounded-2xl border bg-surface/60 p-5 text-left transition hover:-translate-y-0.5 hover:bg-surface ${
        selected ? 'border-accent ring-1 ring-accent/40' : 'border-border hover:border-muted'
      }`}
    >
      {badge && <span className="font-meta text-[10px] uppercase tracking-[0.18em] text-accent">{badge}</span>}
      <div className={`${small ? 'text-lg' : 'mt-1 text-2xl'} font-display`}>{title}</div>
      <p className="mt-1.5 text-sm text-muted">{desc}</p>
    </button>
  );
}

function StepNav({
  onBack,
  onNext,
  nextLabel = 'Continuar',
  nextDisabled,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="mt-9 flex items-center gap-3">
      <button onClick={onBack} className="rounded-full px-4 py-2.5 text-sm text-muted transition hover:text-fg">
        ← Atrás
      </button>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
      >
        {nextLabel}
      </button>
    </div>
  );
}
