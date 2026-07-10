'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CaptureCard } from '@/components/personal/capture-card';
import { ProjectTasks } from '@/components/personal/project-tasks';
import { ENTRY_LABEL, usePersonal, type EntryType } from '@/lib/personal/store';

type ShellBridge = { isDesktop?: boolean; chooseFolder?: () => Promise<string | null> };
function shell(): ShellBridge | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { pulso?: ShellBridge }).pulso : undefined;
}

type Tab = 'resumen' | 'tareas' | 'bitacora' | 'archivos';
const TABS: Array<[Tab, string]> = [
  ['resumen', 'Resumen'],
  ['tareas', 'Tareas'],
  ['bitacora', 'Bitácora'],
  ['archivos', 'Archivos'],
];

const BITACORA_FILTERS: Array<{ label: string; types: EntryType[] | null }> = [
  { label: 'Todo', types: null },
  { label: 'Avances', types: ['PROGRESS', 'DELIVERY'] },
  { label: 'Investigación', types: ['RESEARCH'] },
  { label: 'Decisiones', types: ['DECISION'] },
  { label: 'Bloqueos', types: ['BLOCKER'] },
];

function fmt(ts: number): string {
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ts);
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { ready, projects, entries, tasks, storage, storageDir, updateProjectContext, setProjectMarkdownDir } = usePersonal();
  const project = projects.find((p) => p.id === id);

  const [tab, setTab] = useState<Tab>('resumen');
  const [editingCtx, setEditingCtx] = useState(false);
  const [ctxDraft, setCtxDraft] = useState('');
  const [filter, setFilter] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => setIsDesktop(Boolean(shell()?.isDesktop)), []);

  async function pickProjectFolder() {
    if (!project) return;
    const dir = await shell()?.chooseFolder?.();
    if (dir) setProjectMarkdownDir(project.id, dir);
  }

  if (ready && !project) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-muted">Ese proyecto no existe.</p>
        <Link href="/personal/proyectos" className="mt-3 inline-block text-sm text-accent">← Volver a proyectos</Link>
      </main>
    );
  }
  if (!project) return null;

  const projEntries = entries.filter((e) => e.projectId === project.id);
  const decisions = projEntries.filter((e) => e.type === 'DECISION');
  const blockers = projEntries.filter((e) => e.type === 'BLOCKER');
  const lastEntry = projEntries[0];

  const fil = BITACORA_FILTERS[filter]!;
  const shownEntries = fil.types ? projEntries.filter((e) => fil.types!.includes(e.type)) : projEntries;

  function exportMarkdown() {
    const out: string[] = [`# ${project!.name}`, ''];
    if (project!.context) out.push(project!.context, '');
    const pend = tasks.filter((t) => t.projectId === project!.id && !t.done);
    const done = tasks.filter((t) => t.projectId === project!.id && t.done);
    if (pend.length || done.length) {
      out.push('## Tareas', '');
      pend.forEach((t) => out.push(`- [ ] ${t.title}`));
      done.forEach((t) => out.push(`- [x] ${t.title}`));
      out.push('');
    }
    if (projEntries.length) {
      out.push('## Bitácora', '');
      projEntries.forEach((e) => {
        out.push(`### ${ENTRY_LABEL[e.type]} · ${new Date(e.createdAt).toLocaleDateString('es-AR')}`, '', `**${e.title}**`, '', e.content, '');
      });
    }
    const blob = new Blob([out.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project!.name.replace(/[^\w\d-]+/g, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-14">
      <Link href="/personal/proyectos" className="font-meta text-[11px] uppercase tracking-wide text-muted transition hover:text-fg">
        ← Proyectos
      </Link>
      <h1 className="font-display mt-3 text-4xl sm:text-5xl">{project.name}</h1>

      {/* Tabs */}
      <nav className="mt-6 flex gap-6 border-b border-border">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 pb-2.5 text-sm transition ${
              tab === key ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div key={tab} className="pulso-reveal mt-8">
        {tab === 'resumen' && (
          <div className="space-y-8">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-meta text-[11px] uppercase tracking-[0.2em] text-muted">Contexto</h2>
                <button
                  onClick={() => {
                    setCtxDraft(project.context ?? '');
                    setEditingCtx((v) => !v);
                  }}
                  className="text-xs text-muted transition hover:text-fg"
                >
                  {editingCtx ? 'Cancelar' : 'Editar'}
                </button>
              </div>
              {editingCtx ? (
                <div>
                  <textarea
                    autoFocus
                    value={ctxDraft}
                    onChange={(e) => setCtxDraft(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-xl border border-border bg-surface/60 p-3 text-sm outline-none focus:border-accent"
                  />
                  <button
                    onClick={() => {
                      updateProjectContext(project.id, ctxDraft.trim());
                      setEditingCtx(false);
                    }}
                    className="mt-2 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-bg"
                  >
                    Guardar contexto
                  </button>
                </div>
              ) : project.context ? (
                <p className="text-[15px] leading-relaxed text-fg/90">{project.context}</p>
              ) : (
                <p className="text-sm italic text-muted">Sin contexto todavía. Contale a Pulso de qué trata el proyecto.</p>
              )}
            </section>

            <CaptureCard projectId={project.id} />

            <div className="grid gap-6 sm:grid-cols-2">
              <Mini title="Decisiones recientes" empty="Sin decisiones aún." items={decisions.slice(0, 4).map((e) => e.title)} />
              <Mini title="Bloqueos" empty="Sin bloqueos." tone="warn" items={blockers.slice(0, 4).map((e) => e.title)} />
            </div>

            {lastEntry && (
              <p className="font-meta text-[11px] uppercase tracking-wide text-muted">
                Último avance: {ENTRY_LABEL[lastEntry.type]} · {fmt(lastEntry.createdAt)}
              </p>
            )}
          </div>
        )}

        {tab === 'tareas' && <ProjectTasks projectId={project.id} />}

        {tab === 'bitacora' && (
          <div>
            <div className="mb-6 flex flex-wrap gap-2">
              {BITACORA_FILTERS.map((f, idx) => (
                <button
                  key={f.label}
                  onClick={() => setFilter(idx)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs transition ${
                    idx === filter ? 'border-accent text-accent' : 'border-border text-muted hover:border-muted hover:text-fg'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {shownEntries.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted">Nada por acá todavía.</p>
            ) : (
              <ol className="relative space-y-5 border-l border-border pl-6">
                {shownEntries.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[1.7rem] top-1.5 h-2 w-2 rounded-full bg-accent" />
                    <div className="font-meta flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted">
                      <span className="text-accent">{ENTRY_LABEL[e.type]}</span>
                      <span>·</span>
                      <span>{fmt(e.createdAt)}</span>
                    </div>
                    <h3 className="font-display mt-1 text-xl">{e.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{e.content}</p>
                    {e.image && <img src={e.image} alt="captura" className="mt-2 max-h-44 w-auto rounded-lg border border-border" />}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {tab === 'archivos' && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-surface/50 p-5">
              <h2 className="font-display text-xl">Carpeta Markdown de este proyecto</h2>
              <p className="mt-1 text-sm text-muted">
                Cada entrada que apruebes se agrega al .md de este proyecto en su carpeta (tu bóveda Obsidian, Logseq, un
                repo…). Cada proyecto puede guardar en un lugar distinto.
              </p>
              {project.markdownDir ? (
                <p className="mt-3 text-sm">
                  <span className="font-meta text-fg">{project.markdownDir}</span>
                  {isDesktop && (
                    <>
                      <button onClick={pickProjectFolder} className="ml-3 text-sm text-accent underline-offset-2 transition hover:underline">
                        Cambiar…
                      </button>
                      <button
                        onClick={() => setProjectMarkdownDir(project.id, null)}
                        className="ml-3 text-sm text-muted transition hover:text-fg"
                        title="Volver a usar la carpeta general de Ajustes"
                      >
                        Quitar
                      </button>
                    </>
                  )}
                </p>
              ) : (
                <p className="mt-3 text-sm text-muted">
                  {storage === 'markdown' && storageDir ? (
                    <>
                      Ahora usa la carpeta general: <span className="font-meta text-fg">{storageDir}</span>.
                    </>
                  ) : (
                    'Este proyecto todavía no guarda en Markdown.'
                  )}{' '}
                  {isDesktop ? (
                    <button onClick={pickProjectFolder} className="text-accent underline-offset-2 transition hover:underline">
                      Elegir carpeta propia…
                    </button>
                  ) : (
                    'La carpeta se elige en la app de escritorio.'
                  )}
                </p>
              )}
            </section>
            <section className="rounded-2xl border border-border bg-surface/50 p-5">
              <h2 className="font-display text-xl">Exportar</h2>
              <p className="mt-1 text-sm text-muted">Bajá el proyecto completo (contexto, tareas y bitácora) como un único .md.</p>
              <button onClick={exportMarkdown} className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition hover:brightness-110">
                ↓ Exportar a Markdown
              </button>
            </section>
            <section className="rounded-2xl border border-dashed border-border p-5">
              <h2 className="font-display text-xl text-muted">Importar</h2>
              <p className="mt-1 text-sm text-muted">Desde carpeta Markdown / Obsidian, Notion o GitHub. Próximamente.</p>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function Mini({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone?: 'warn' }) {
  return (
    <section>
      <h2 className="font-meta mb-2 text-[11px] uppercase tracking-[0.2em] text-muted">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted/70">{empty}</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {items.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className={tone === 'warn' ? 'text-[#d98a5e]' : 'text-accent'}>{tone === 'warn' ? '●' : '◆'}</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
