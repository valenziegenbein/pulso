'use client';

import { EntryHistory } from '@/components/personal/entry-history';
import { usePersonal } from '@/lib/personal/store';

export default function BitacoraPage() {
  const { entries, projects } = usePersonal();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <div className="mb-8">
        <p className="font-meta text-[11px] uppercase tracking-[0.2em] text-accent">Historial personal</p>
        <h1 className="font-display mt-1 text-4xl sm:text-5xl">Bitácora</h1>
        <p className="mt-2 text-sm text-muted">Entradas ordenadas, acotadas por página y disponibles para búsqueda completa.</p>
      </div>
      <EntryHistory entries={entries} projects={projects} />
    </main>
  );
}
