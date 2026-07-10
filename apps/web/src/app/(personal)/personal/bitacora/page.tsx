'use client';

import { useState } from 'react';
import { EntryHistory } from '@/components/personal/entry-history';
import { usePersonal } from '@/lib/personal/store';

export default function BitacoraPage() {
  const { entries, projects } = usePersonal();
  // Foco de la vista, independiente del "proyecto en foco" global (el que usa
  // el widget para capturar): acá es solo un filtro de qué mirar.
  const [projectId, setProjectId] = useState('');
  const shown = projectId ? entries.filter((e) => e.projectId === projectId) : entries;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-meta text-[11px] uppercase tracking-[0.2em] text-accent">Historial personal</p>
          <h1 className="font-display mt-1 text-4xl sm:text-5xl">Bitácora</h1>
          <p className="mt-2 text-sm text-muted">Entradas ordenadas, acotadas por página y disponibles para búsqueda completa.</p>
        </div>
        {projects.length > 0 && (
          <label className="shrink-0">
            <span className="font-meta mb-1 block text-[10px] uppercase tracking-[0.18em] text-muted">Proyecto</span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition focus:border-accent"
            >
              <option value="">Todos los proyectos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <EntryHistory entries={shown} projects={projects} />
    </main>
  );
}
