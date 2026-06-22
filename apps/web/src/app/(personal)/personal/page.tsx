'use client';

import Link from 'next/link';
import { CaptureCard } from '@/components/personal/capture-card';
import { ProjectChooser } from '@/components/personal/project-chooser';
import { ProjectTasks } from '@/components/personal/project-tasks';
import { ENTRY_LABEL, usePersonal } from '@/lib/personal/store';

const STORAGE_LABEL: Record<string, string> = {
  pulso: 'En Pulso',
  markdown: 'Carpeta Markdown / Obsidian',
  notion: 'Notion',
};

function relative(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(ts);
}

export default function PersonalHome() {
  const { name, entries, storage, focusProject } = usePersonal();
  const recent = entries.filter((e) => !focusProject || e.projectId === focusProject.id).slice(0, 5);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-14">
      <header className="pulso-reveal mb-7 flex items-start justify-between gap-4" style={{ animationDelay: '40ms' }}>
        <div>
          <p className="font-meta text-xs uppercase tracking-[0.2em] text-muted">
            {new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(Date.now())}
          </p>
          <h1 className="font-display mt-1 text-4xl sm:text-5xl">Hola, {name ?? 'vos'}.</h1>
        </div>
        <ProjectChooser variant="switcher" />
      </header>

      <div className="pulso-reveal" style={{ animationDelay: '120ms' }}>
        <CaptureCard />
      </div>

      <div className="pulso-reveal mt-10 grid gap-8 sm:grid-cols-2" style={{ animationDelay: '220ms' }}>
        <ProjectTasks />

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-meta text-[11px] uppercase tracking-[0.2em] text-muted">Bitácora reciente</h2>
            <Link href="/personal/bitacora" className="text-xs text-muted transition hover:text-fg">Ver toda</Link>
          </div>
          {recent.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface/40 p-4 text-sm text-muted">
              Todavía no registraste nada acá. Escribí una frase arriba ↑
            </p>
          ) : (
            <ul className="space-y-2">
              {recent.map((e) => (
                <li key={e.id} className="rounded-2xl border border-border bg-surface/40 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-meta text-[10px] uppercase tracking-[0.16em] text-accent">{ENTRY_LABEL[e.type]}</span>
                    <span className="font-meta text-[10px] text-muted">{relative(e.createdAt)}</span>
                  </div>
                  <div className="mt-1 text-sm text-fg">{e.title}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="pulso-reveal mt-8" style={{ animationDelay: '320ms' }}>
        {storage ? (
          <div className="font-meta inline-flex items-center gap-2 rounded-full border border-border bg-surface/40 px-3 py-1.5 text-[11px] text-muted">
            <span className="pulso-beat inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Guardando en {STORAGE_LABEL[storage] ?? storage} · activo
          </div>
        ) : (
          <Link href="/personal/ajustes" className="font-meta text-[11px] uppercase tracking-wide text-muted transition hover:text-fg">
            Elegí dónde guardar tus avances →
          </Link>
        )}
      </div>
    </main>
  );
}
