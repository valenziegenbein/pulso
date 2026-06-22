'use client';

import { useState } from 'react';
import { ENTRY_LABEL, usePersonal, type EntryType } from '@/lib/personal/store';

const FILTERS: Array<{ label: string; types: EntryType[] | null }> = [
  { label: 'Todo', types: null },
  { label: 'Avances', types: ['PROGRESS', 'DELIVERY'] },
  { label: 'Investigación', types: ['RESEARCH'] },
  { label: 'Decisiones', types: ['DECISION'] },
  { label: 'Bloqueos', types: ['BLOCKER'] },
];

function fmt(ts: number): string {
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ts);
}

export default function BitacoraPage() {
  const { entries, projects } = usePersonal();
  const [active, setActive] = useState(0);

  const filter = FILTERS[active]!;
  const shown = filter.types ? entries.filter((e) => filter.types!.includes(e.type)) : entries;
  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <h1 className="font-display mb-6 text-4xl sm:text-5xl">Bitácora</h1>

      <div className="mb-8 flex flex-wrap gap-2">
        {FILTERS.map((f, idx) => (
          <button
            key={f.label}
            onClick={() => setActive(idx)}
            className={`rounded-full border px-3.5 py-1.5 text-xs transition ${
              idx === active ? 'border-accent text-accent' : 'border-border text-muted hover:border-muted hover:text-fg'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted">
          Nada por acá todavía.
        </p>
      ) : (
        <ol className="relative space-y-5 border-l border-border pl-6">
          {shown.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[1.7rem] top-1.5 h-2 w-2 rounded-full bg-accent" />
              <div className="font-meta flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted">
                <span className="text-accent">{ENTRY_LABEL[e.type]}</span>
                <span>·</span>
                <span>{fmt(e.createdAt)}</span>
                {projectName(e.projectId) && (
                  <>
                    <span>·</span>
                    <span>{projectName(e.projectId)}</span>
                  </>
                )}
              </div>
              <h3 className="font-display mt-1 text-xl">{e.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{e.content}</p>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
