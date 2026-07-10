'use client';

import { useEffect, useMemo, useState } from 'react';
import { ENTRY_LABEL, type Entry, type EntryType, type Project } from '@/lib/personal/store';
import { Pagination } from './pagination';

const PAGE_SIZE = 10;
const SEARCH_LIMIT = 30;
const TABS: Array<{ key: string; label: string; types: EntryType[] | null }> = [
  { key: 'all', label: 'Todo', types: null },
  { key: 'progress', label: 'Avances', types: ['PROGRESS', 'DELIVERY'] },
  { key: 'tasks', label: 'Tareas', types: ['TASK'] },
  { key: 'decisions', label: 'Decisiones', types: ['DECISION'] },
  { key: 'blockers', label: 'Bloqueos', types: ['BLOCKER'] },
  { key: 'notes', label: 'Notas', types: ['NOTE', 'RESEARCH'] },
];

function fmt(ts: number): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ts);
}

function searchable(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function EntryHistory({
  entries,
  projects = [],
}: {
  entries: Entry[];
  projects?: Array<Pick<Project, 'id' | 'name'>>;
}) {
  const [tab, setTab] = useState(TABS[0]!.key);
  const [page, setPage] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const sorted = useMemo(() => [...entries].sort((a, b) => b.createdAt - a.createdAt), [entries]);
  const activeTab = TABS.find((item) => item.key === tab) ?? TABS[0]!;
  const filtered = activeTab.types ? sorted.filter((entry) => activeTab.types!.includes(entry.type)) : sorted;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const projectName = (id: string | null) => projects.find((project) => project.id === id)?.name;

  useEffect(() => setPage(0), [tab]);
  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setSearchOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  const normalizedQuery = searchable(query.trim());
  const searchResults = normalizedQuery
    ? sorted
        .filter((entry) => searchable([
          ENTRY_LABEL[entry.type],
          entry.title,
          entry.content,
          projectName(entry.projectId) ?? '',
        ].join(' ')).includes(normalizedQuery))
        .slice(0, SEARCH_LIMIT)
    : [];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap gap-2">
          {TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`rounded-full border px-3.5 py-1.5 text-xs transition ${
                item.key === tab ? 'border-accent text-accent' : 'border-border text-muted hover:border-muted hover:text-fg'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Pagination variant="compact" page={page} pageCount={pageCount} onChange={setPage} />
          <button
            onClick={() => setSearchOpen(true)}
            className="shrink-0 rounded-full border border-border px-3.5 py-1.5 text-xs text-muted transition hover:border-accent hover:text-fg"
          >
            Buscar
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted">Nada por acá todavía.</p>
      ) : (
        <EntryList entries={shown} projectName={projectName} />
      )}

      {pageCount > 1 && (
        <div className="mt-7 flex justify-center border-t border-border/60 pt-5">
          <Pagination variant="expanded" page={page} pageCount={pageCount} onChange={setPage} />
        </div>
      )}

      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 p-4 pt-[10vh] backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => event.currentTarget === event.target && setSearchOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="entry-search-title"
            className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-[#1e1810] shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <p className="font-meta text-[10px] uppercase tracking-[0.18em] text-accent">Historial</p>
                <h2 id="entry-search-title" className="font-display text-xl">Buscar en la bitácora</h2>
              </div>
              <button onClick={() => setSearchOpen(false)} className="text-sm text-muted transition hover:text-fg">Cerrar</button>
            </header>
            <div className="p-5">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Título, contenido, proyecto o etiqueta..."
                className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-fg outline-none placeholder:text-muted/60 focus:border-accent"
              />
              <div className="mt-4 max-h-[55vh] overflow-y-auto pr-1">
                {!normalizedQuery ? (
                  <p className="py-8 text-center text-sm text-muted">Escribí para buscar en todas las entradas.</p>
                ) : searchResults.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted">No encontramos coincidencias.</p>
                ) : (
                  <EntryList entries={searchResults} projectName={projectName} compact />
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function EntryList({
  entries,
  projectName,
  compact = false,
}: {
  entries: Entry[];
  projectName: (id: string | null) => string | undefined;
  compact?: boolean;
}) {
  return (
    <ol className={`relative border-l border-border pl-6 ${compact ? 'space-y-4' : 'space-y-5'}`}>
      {entries.map((entry) => {
        const project = projectName(entry.projectId);
        return (
          <li key={entry.id} className="relative">
            <span className="absolute -left-[1.7rem] top-1.5 h-2 w-2 rounded-full bg-accent" />
            <div className="font-meta flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted">
              <span className="text-accent">{ENTRY_LABEL[entry.type]}</span>
              <span>·</span>
              <span>{fmt(entry.createdAt)}</span>
              {project && <><span>·</span><span>{project}</span></>}
            </div>
            <h3 className={`font-display mt-1 ${compact ? 'text-lg' : 'text-xl'}`}>{entry.title}</h3>
            <p className={`mt-1 whitespace-pre-line leading-relaxed text-muted ${compact ? 'line-clamp-3 text-xs' : 'text-sm'}`}>
              {entry.content}
            </p>
            {!compact && entry.image && (
              <img src={entry.image} alt="captura" className="mt-2 max-h-44 w-auto rounded-lg border border-border" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
