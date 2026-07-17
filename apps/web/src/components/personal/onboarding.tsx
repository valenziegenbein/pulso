'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ENTRY_LABEL, usePersonal, type AiMode, type StorageTarget } from '@/lib/personal/store';
import { PersonalWidget } from './personal-widget';
import { LocalAiSetup } from './local-ai-setup';
import { CloudAiSetup } from './cloud-ai-setup';
import { AccountAiSetup } from './account-ai-setup';

const STEPS = ['intro', 'mode', 'name', 'project', 'storage', 'ai', 'widget', 'snap', 'done'] as const;

type ShellBridge = {
  isDesktop?: boolean;
  introWidget?: () => void;
  collapse?: () => void;
  openTeams?: () => void;
  getTeamsUrl?: () => Promise<string | null>;
  setTeamsUrl?: (url: string) => void;
  chooseFolder?: () => Promise<string | null>;
};
function shell(): ShellBridge | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { pulso?: ShellBridge }).pulso : undefined;
}

export function Onboarding() {
  const router = useRouter();
  const { setName, addProject, setStorage, setStorageDir, setAi, completeOnboarding, entries, focusProject } = usePersonal();

  const [i, setI] = useState(0);
  const [name, setNameLocal] = useState('');
  const [projName, setProjName] = useState('');
  const [projCtx, setProjCtx] = useState('');
  const [storage, setStorageLocal] = useState<StorageTarget>(null);
  const [storageDir, setStorageDirLocal] = useState<string | null>(null);
  const [ai, setAiLocal] = useState<AiMode>(null);
  const [committed, setCommitted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [teamsMode, setTeamsMode] = useState(false);
  const [teamsUrl, setTeamsUrlLocal] = useState('');

  useEffect(() => setIsDesktop(Boolean(shell()?.isDesktop)), []);

  // "Con mi equipo": en web va al login del server; en desktop abre el server
  // remoto en su propia ventana (Teams vive en el server, no en el embebido).
  async function chooseTeams() {
    const b = shell();
    if (!b?.isDesktop) {
      router.push('/login');
      return;
    }
    const existing = await b.getTeamsUrl?.();
    if (existing) b.openTeams?.();
    else setTeamsMode(true);
  }
  function connectTeams() {
    const b = shell();
    const url = teamsUrl.trim();
    if (!b || !url) return;
    b.setTeamsUrl?.(url);
    b.openTeams?.();
  }

  const step = STEPS[i];
  const go = (n: number) => setI((v) => Math.min(Math.max(v + n, 0), STEPS.length - 1));

  // Commit nombre + proyecto al entrar al paso del widget (para que tenga destino).
  function enterWidget() {
    if (!committed) {
      setCommitted(true);
      if (name.trim()) setName(name.trim());
      addProject({ name: projName.trim() || 'Mi primer proyecto', context: projCtx.trim() || undefined });
    }
    go(1);
  }

  // Al llegar al paso "snap", el widget real ya snapeó al borde → lo minimizamos.
  useEffect(() => {
    if (STEPS[i] !== 'snap') return;
    const t = setTimeout(() => shell()?.collapse?.(), 1200);
    return () => clearTimeout(t);
  }, [i]);

  // "Carpeta Markdown": en desktop abre el diálogo del sistema para elegirla.
  async function chooseMarkdown() {
    setStorageLocal('markdown');
    const b = shell();
    if (!b?.isDesktop || !b.chooseFolder) return;
    const dir = await b.chooseFolder();
    if (dir) setStorageDirLocal(dir);
  }

  function finish() {
    setStorage(storage);
    setStorageDir(storage === 'markdown' ? storageDir : null);
    setAi(ai);
    completeOnboarding();
    router.push('/personal');
  }

  const liveEntries = entries.filter((e) => !focusProject || e.projectId === focusProject.id).slice(0, 4);

  return (
    <main className="flex min-h-screen flex-col px-6 py-8">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="pulso-beat inline-block text-accent">✦</span> Pulso
        </div>
        <span className="font-meta text-xs text-muted">
          {String(i + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
        </span>
      </header>

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
            {teamsMode ? (
              <div className="pulso-reveal mt-8 max-w-md">
                <p className="mb-2 text-sm text-muted">Pegá la URL de tu Pulso Teams (te la pasa tu organización):</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    autoFocus
                    value={teamsUrl}
                    onChange={(e) => setTeamsUrlLocal(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && connectTeams()}
                    placeholder="https://pulso.tu-empresa.com"
                    className="font-meta min-w-[16rem] flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition placeholder:text-muted/60 focus:border-accent"
                  />
                  <button onClick={connectTeams} disabled={!teamsUrl.trim()} className="shrink-0 rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40">
                    Conectar
                  </button>
                </div>
                <button onClick={() => setTeamsMode(false)} className="mt-3 text-sm text-muted transition hover:text-fg">← Volver</button>
              </div>
            ) : (
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <OptionCard title="Para mí" desc="Local o BYOK gratis, sin cuenta ni suscripción. Tus datos son tuyos." badge="Personal" onClick={() => go(1)} />
                <OptionCard title="Con mi equipo" desc="Equipos, personas, tareas y resultados. Tu cuenta del server." badge="Teams" onClick={chooseTeams} />
              </div>
            )}
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

        {step === 'widget' && (
          <div>
            <p className="font-meta mb-3 text-xs uppercase tracking-[0.2em] text-accent">Tu widget</p>
            <h1 className="font-display text-4xl sm:text-5xl">Capturá sin cortar el flujo</h1>
            <p className="mt-3 max-w-lg text-muted">
              Contá en una frase qué estás haciendo (o sumá una captura) y la IA arma tu bitácora. <span className="text-fg">Probalo acá 👇</span>
            </p>
            <div className="mt-7 flex flex-col gap-5 sm:flex-row sm:items-start">
              <PersonalWidget embedded />
              <div className="flex-1">
                <p className="font-meta mb-2 text-[11px] uppercase tracking-[0.2em] text-muted">Tu bitácora</p>
                {liveEntries.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">Lo que generes aparece acá.</p>
                ) : (
                  <ul className="space-y-2">
                    {liveEntries.map((e) => (
                      <li key={e.id} className="pulso-reveal rounded-xl border border-border bg-surface/40 p-3">
                        <span className="font-meta text-[10px] uppercase tracking-[0.16em] text-accent">{ENTRY_LABEL[e.type]}</span>
                        <div className="mt-0.5 text-sm">{e.title}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <StepNav onBack={() => go(-1)} onNext={() => { shell()?.introWidget?.(); go(1); }} nextLabel="Continuar" />
          </div>
        )}

        {step === 'snap' && (
          <div>
            <p className="font-meta mb-3 text-xs uppercase tracking-[0.2em] text-accent">Siempre a mano</p>
            <h1 className="font-display text-4xl sm:text-5xl">Vive en el borde</h1>
            <p className="mt-4 max-w-md text-lg text-muted">
              Tu widget se minimiza solo y se acomoda en el borde de la pantalla para no molestarte. Cuando necesites anotar algo, abrilo con{' '}
              <span className="font-meta text-accent">Ctrl + Shift + P</span> o tocá <span className="text-fg">Anotar</span>. Al terminar, vuelve al borde.
            </p>
            {isDesktop && <p className="mt-4 text-sm text-muted">👉 Mirá la esquina de tu pantalla: ahí quedó, minimizado.</p>}
            <StepNav onBack={() => go(-1)} onNext={() => go(1)} nextLabel="Continuar" />
          </div>
        )}

        {step === 'storage' && (
          <div>
            <h1 className="font-display text-4xl sm:text-5xl">¿Dónde guardás tus avances?</h1>
            <p className="mt-3 text-muted">Pulso captura. Tu sistema favorito guarda.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <OptionCard small title="En Pulso" desc="Base local simple." selected={storage === 'pulso'} onClick={() => setStorageLocal('pulso')} />
              <OptionCard small title="Carpeta Markdown" desc="Obsidian, Logseq, Git." selected={storage === 'markdown'} onClick={chooseMarkdown} />
            </div>
            {storage === 'markdown' && (
              <p className="pulso-reveal mt-4 text-sm text-muted">
                {storageDir ? (
                  <>
                    Cada entrada aprobada se agrega a un .md por proyecto en{' '}
                    <button onClick={chooseMarkdown} className="font-meta text-accent underline-offset-2 transition hover:underline" title="Cambiar carpeta">
                      {storageDir}
                    </button>
                  </>
                ) : isDesktop ? (
                  <button onClick={chooseMarkdown} className="text-accent underline-offset-2 transition hover:underline">
                    Elegí la carpeta destino…
                  </button>
                ) : (
                  'La carpeta se elige en la app de escritorio. Acá queda anotada tu preferencia.'
                )}
              </p>
            )}
            <StepNav onBack={() => go(-1)} onNext={() => go(1)} nextLabel={storage ? 'Continuar' : 'Configurar después'} />
          </div>
        )}

        {step === 'ai' && (
          <div>
            <h1 className="font-display text-4xl sm:text-5xl">¿Cómo querés usar la IA?</h1>
            <p className="mt-3 text-muted">La IA propone la bitácora. Vos siempre aprobás.</p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <OptionCard small title="IA local" desc="Gratis y privada. Ollama, LM Studio o vLLM." badge="Recomendado" selected={ai === 'local'} onClick={() => setAiLocal('local')} />
              <OptionCard small title="API key propia" desc="Pulso gratis; tu proveedor puede cobrar el uso." badge="BYOK" selected={ai === 'byok'} onClick={() => setAiLocal('byok')} />
              <OptionCard small title="Con mi cuenta Pulso" desc="IA administrada. Acceso anticipado cerrado." badge="Personal AI" selected={ai === 'account'} onClick={() => setAiLocal('account')} />
              <OptionCard small title="Sin IA por ahora" desc="Bitácora manual." selected={ai === 'none'} onClick={() => setAiLocal('none')} />
            </div>
            {ai === 'account' && (
              <div className="pulso-reveal mt-6">
                <AccountAiSetup />
              </div>
            )}
            {ai === 'local' && (
              <div className="pulso-reveal mt-6">
                <LocalAiSetup />
              </div>
            )}
            {ai === 'byok' && (
              <div className="pulso-reveal mt-6">
                <CloudAiSetup />
              </div>
            )}
            <StepNav onBack={() => go(-1)} onNext={enterWidget} nextLabel={ai ? 'Continuar' : 'Decidir después'} />
          </div>
        )}

        {step === 'done' && (
          <div>
            <p className="font-meta mb-4 text-xs uppercase tracking-[0.2em] text-accent">Todo listo</p>
            <h1 className="font-display text-5xl sm:text-6xl">{name.trim() ? `Listo, ${name.trim()}.` : 'Listo.'}</h1>
            <p className="mt-5 max-w-md text-lg text-muted">
              Tu taller está armado y tu widget espera en el borde. Cuando quieras capturar algo, solo escribí una frase.
            </p>
            <button onClick={finish} className="mt-8 rounded-full bg-accent px-7 py-3 font-medium text-bg transition hover:brightness-110">
              Entrar a Pulso →
            </button>
          </div>
        )}
      </div>

      <footer className="mx-auto flex w-full max-w-2xl items-center justify-center gap-2">
        {STEPS.map((s, idx) => (
          <span key={s} className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-6 bg-accent' : 'w-1.5 bg-border'}`} />
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
