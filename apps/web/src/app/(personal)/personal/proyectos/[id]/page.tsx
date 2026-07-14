'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CaptureCard } from '@/components/personal/capture-card';
import { EntryHistory } from '@/components/personal/entry-history';
import { ProjectTasks } from '@/components/personal/project-tasks';
import { NotesIndexPanel } from '@/components/personal/notes-index-panel';
import { embeddingsReady } from '@/lib/personal/ai';
import { ENTRY_LABEL, usePersonal, type EntryType } from '@/lib/personal/store';

type ImportedDaily = { typeLabel: string; title: string; content: string; createdAt: number };
type ImportedGeneric = { file: string; title: string; content: string; mtime: number };
type ShellBridge = {
  isDesktop?: boolean;
  chooseFolder?: () => Promise<string | null>;
  importMarkdown?: (payload: { dir: string }) => Promise<{ dailyEntries: ImportedDaily[]; genericNotes: ImportedGeneric[] }>;
};
function shell(): ShellBridge | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { pulso?: ShellBridge }).pulso : undefined;
}

// Reverso de ENTRY_LABEL: la etiqueta humana que quedó escrita en el .md
// ("Avance", "Decisión"...) vuelve a su EntryType. Sin match → Nota.
const LABEL_TO_TYPE: Record<string, EntryType> = Object.fromEntries(
  Object.entries(ENTRY_LABEL).map(([type, label]) => [label, type as EntryType]),
);

type Tab = 'resumen' | 'tareas' | 'bitacora' | 'archivos';
const TABS: Array<[Tab, string]> = [
  ['resumen', 'Resumen'],
  ['tareas', 'Tareas'],
  ['bitacora', 'Bitácora'],
  ['archivos', 'Archivos'],
];

function fmt(ts: number): string {
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ts);
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { ready, projects, entries, tasks, storage, storageDir, ai, aiConfig, embeddingsEnabled, updateProjectContext, setProjectMarkdownDir, setProjectNotesContext, importEntries } = usePersonal();
  const project = projects.find((p) => p.id === id);

  const [tab, setTab] = useState<Tab>('resumen');
  const [editingCtx, setEditingCtx] = useState(false);
  const [ctxDraft, setCtxDraft] = useState('');
  const [isDesktop, setIsDesktop] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null);
  useEffect(() => setIsDesktop(Boolean(shell()?.isDesktop)), []);

  async function pickProjectFolder() {
    if (!project) return;
    const dir = await shell()?.chooseFolder?.();
    if (dir) setProjectMarkdownDir(project.id, dir);
  }

  async function runImport() {
    if (!project) return;
    const dir = await shell()?.chooseFolder?.();
    if (!dir) return;
    setImporting(true);
    setImportResult(null);
    try {
      const { dailyEntries, genericNotes } = (await shell()?.importMarkdown?.({ dir })) ?? { dailyEntries: [], genericNotes: [] };
      const inputs = [
        ...dailyEntries.map((e) => ({
          projectId: project.id,
          type: LABEL_TO_TYPE[e.typeLabel] ?? ('NOTE' as EntryType),
          title: e.title,
          content: e.content,
          createdAt: e.createdAt,
        })),
        ...genericNotes.map((n) => ({
          projectId: project.id,
          type: 'NOTE' as EntryType,
          title: n.title,
          content: n.content,
          createdAt: n.mtime,
        })),
      ];
      const added = importEntries(inputs);
      setImportResult({ added, skipped: inputs.length - added });
    } finally {
      setImporting(false);
    }
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

        {tab === 'bitacora' && <EntryHistory entries={projEntries} />}

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

              {/* Asistente de notas (opt-in): la carpeta también se puede LEER como contexto. */}
              {isDesktop && (project.markdownDir ?? (storage === 'markdown' ? storageDir : null)) && (
                <div className="mt-4 border-t border-border/60 pt-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={Boolean(project.useNotesContext)}
                      onChange={(e) => setProjectNotesContext(project.id, e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="text-sm">
                      Usar mis notas como contexto para la IA
                      <span className="mt-0.5 block text-xs text-muted">
                        Al generar un borrador, Pulso lee extractos de las notas recientes de esta carpeta (solo lectura,
                        solo esta carpeta).{' '}
                        {aiConfig && (aiConfig.provider === 'openai' || aiConfig.provider === 'anthropic') ? (
                          <span className="text-[#d98a5e]">
                            Tu IA es cloud ({aiConfig.provider === 'openai' ? 'OpenAI' : 'Anthropic'}): esos extractos viajan
                            al proveedor.
                          </span>
                        ) : (
                          'Con IA local, todo queda en tu máquina.'
                        )}
                      </span>
                    </span>
                  </label>
                </div>
              )}

              {/* Búsqueda semántica (etapa 2b): solo si está activada en Ajustes,
                  el proveedor la soporta, y este proyecto lee sus notas. */}
              {isDesktop &&
                project.useNotesContext &&
                embeddingsEnabled &&
                embeddingsReady(ai, aiConfig) &&
                (project.markdownDir ?? (storage === 'markdown' ? storageDir : null)) && (
                  <NotesIndexPanel dir={(project.markdownDir ?? storageDir)!} ai={ai} aiConfig={aiConfig} />
                )}
            </section>
            <section className="rounded-2xl border border-border bg-surface/50 p-5">
              <h2 className="font-display text-xl">Exportar</h2>
              <p className="mt-1 text-sm text-muted">Bajá el proyecto completo (contexto, tareas y bitácora) como un único .md.</p>
              <button onClick={exportMarkdown} className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition hover:brightness-110">
                ↓ Exportar a Markdown
              </button>
            </section>
            <section className="rounded-2xl border border-border bg-surface/50 p-5">
              <h2 className="font-display text-xl">Importar</h2>
              <p className="mt-1 text-sm text-muted">
                Desde una carpeta Markdown / Obsidian. Si son archivos diarios que Pulso ya exportó, reconstruye las
                entradas originales (tipo, hora, contenido); cualquier otra nota se agrega como nota suelta. Nunca
                duplica lo que ya está importado, y nunca modifica los archivos.
              </p>
              {isDesktop ? (
                <button
                  onClick={runImport}
                  disabled={importing}
                  className="mt-4 rounded-full border border-border px-5 py-2 text-sm text-fg transition hover:border-accent disabled:opacity-40"
                >
                  {importing ? 'Importando…' : '↑ Elegir carpeta e importar'}
                </button>
              ) : (
                <p className="mt-3 text-sm text-muted">Importar se hace desde la app de escritorio.</p>
              )}
              {importResult && (
                <p className="mt-3 text-sm text-accent">
                  {importResult.added > 0
                    ? `Se agregaron ${importResult.added} entrada${importResult.added === 1 ? '' : 's'}.`
                    : 'No había nada nuevo para agregar.'}
                  {importResult.skipped > 0 ? ` (${importResult.skipped} ya estaban importadas.)` : ''}
                </p>
              )}
              <p className="mt-4 text-xs text-muted/70">Notion y GitHub: próximamente.</p>
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
