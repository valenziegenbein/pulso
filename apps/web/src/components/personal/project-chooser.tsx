'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePersonal } from '@/lib/personal/store';

function relative(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(ts);
}

/**
 * Selector del "proyecto en foco". Cambiarlo redirige la captura, las tareas y
 * la bitácora de la Home. Dos triggers: tarjeta (arriba a la derecha) o inline
 * ("para guardar en: …" en el footer de captura). Comparten el mismo menú.
 */
export function ProjectChooser({ variant }: { variant: 'switcher' | 'inline' }) {
  const { projects, entries, focusProject, setFocusProject } = usePersonal();
  const [open, setOpen] = useState(false);

  const lastActivity = (id: string) => entries.find((e) => e.projectId === id)?.createdAt ?? 0;
  const recent = [...projects]
    .sort((a, b) => lastActivity(b.id) - lastActivity(a.id) || b.createdAt - a.createdAt)
    .slice(0, 4);

  if (!focusProject) {
    return variant === 'switcher' ? (
      <Link
        href="/personal/proyectos"
        className="rounded-xl border border-dashed border-border px-4 py-2.5 text-sm text-muted transition hover:border-accent hover:text-fg"
      >
        + Crear proyecto
      </Link>
    ) : (
      <Link href="/personal/proyectos" className="font-meta text-[11px] uppercase tracking-wide text-muted hover:text-fg">
        + Elegí un proyecto
      </Link>
    );
  }

  const lastEntry = entries.find((e) => e.projectId === focusProject.id);

  return (
    <div className="relative">
      {variant === 'switcher' ? (
        <button
          onClick={() => setOpen((v) => !v)}
          className="group min-w-[12rem] rounded-2xl border border-border bg-surface/50 px-4 py-2.5 text-left transition hover:border-muted hover:bg-surface"
        >
          <div className="font-meta text-[10px] uppercase tracking-[0.18em] text-muted">Proyecto en foco</div>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-display text-lg leading-none">{focusProject.name}</span>
            <span className="ml-auto text-muted transition group-hover:text-fg">⌄</span>
          </div>
          <div className="font-meta mt-1.5 text-[10px] uppercase tracking-wide text-muted">
            {lastEntry ? `último avance: ${relative(lastEntry.createdAt)}` : 'sin avances'}
          </div>
        </button>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          className="font-meta text-[11px] uppercase tracking-[0.14em] text-muted transition hover:text-fg"
        >
          para guardar en: <span className="text-accent">{focusProject.name}</span> ⌄
        </button>
      )}

      {open && (
        <>
          <button className="fixed inset-0 z-30 cursor-default" aria-hidden onClick={() => setOpen(false)} />
          <div
            className={`absolute z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl ${
              variant === 'switcher' ? 'right-0' : 'left-0 bottom-full mb-2 mt-0'
            }`}
          >
            <div className="font-meta border-b border-border px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-muted">
              Proyectos recientes
            </div>
            <ul className="p-1">
              {recent.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => {
                      setFocusProject(p.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-bg ${
                      p.id === focusProject.id ? 'text-accent' : 'text-fg'
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="font-meta ml-2 shrink-0 text-[10px] text-muted">{relative(lastActivity(p.id) || p.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Link
              href="/personal/proyectos"
              onClick={() => setOpen(false)}
              className="block border-t border-border px-3 py-2.5 text-sm text-muted transition hover:bg-bg hover:text-fg"
            >
              + Nuevo proyecto…
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
