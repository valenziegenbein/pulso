'use client';

import Link from 'next/link';
import { CaptureCard } from '@/components/personal/capture-card';
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
  const { name, projects, entries, storage } = usePersonal();
  const lastEntryByProject = (id: string) => entries.find((e) => e.projectId === id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <header className="pulso-reveal mb-8" style={{ animationDelay: '40ms' }}>
        <p className="font-meta text-xs uppercase tracking-[0.2em] text-muted">
          {new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(Date.now())}
        </p>
        <h1 className="font-display mt-1 text-4xl sm:text-5xl">Hola, {name ?? 'vos'}.</h1>
      </header>

      <div className="pulso-reveal" style={{ animationDelay: '120ms' }}>
        <CaptureCard />
      </div>

      <div className="pulso-reveal mt-10 grid gap-6 sm:grid-cols-2" style={{ animationDelay: '220ms' }}>
        {/* Proyectos */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-meta text-[11px] uppercase tracking-[0.2em] text-muted">Mis proyectos</h2>
            <Link href="/personal/proyectos" className="text-xs text-muted transition hover:text-fg">Ver todos</Link>
          </div>
          {projects.length === 0 ? (
            <Link href="/personal/proyectos" className="block rounded-2xl border border-dashed border-border p-5 text-sm text-muted transition hover:border-accent hover:text-fg">
              + Crear tu primer proyecto
            </Link>
          ) : (
            <ul className="space-y-2">
              {projects.slice(0, 4).map((p) => {
                const last = lastEntryByProject(p.id);
                return (
                  <li key={p.id}>
                    <Link href="/personal/proyectos" className="block rounded-2xl border border-border bg-surface/40 p-4 transition hover:-translate-y-0.5 hover:bg-surface">
                      <div className="font-display text-lg">{p.name}</div>
                      <div className="font-meta mt-1 text-[11px] uppercase tracking-wide text-muted">
                        {last ? `Último avance: ${relative(last.createdAt)}` : 'Sin avances aún'}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Bitácora reciente */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-meta text-[11px] uppercase tracking-[0.2em] text-muted">Bitácora reciente</h2>
            <Link href="/personal/bitacora" className="text-xs text-muted transition hover:text-fg">Ver toda</Link>
          </div>
          {entries.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface/40 p-5 text-sm text-muted">
              Todavía no registraste nada. Escribí una frase arriba ↑
            </p>
          ) : (
            <ul className="space-y-2">
              {entries.slice(0, 5).map((e) => (
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

      {/* Destino de exportación */}
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
