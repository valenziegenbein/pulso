'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TASK_PRIORITY_LABEL, TASK_PRIORITY_ORDER, usePersonal, type TaskPriority } from '@/lib/personal/store';

const PRIORITY_DOT: Record<TaskPriority, string> = {
  high: 'bg-[#d98a5e]',
  medium: 'bg-accent',
  low: 'bg-muted',
};
const VISIBLE = 4;

export function ProjectTasks({ projectId }: { projectId?: string } = {}) {
  const { focusProject, projects, tasks, addTask, toggleTask } = usePersonal();
  const project = projectId ? projects.find((p) => p.id === projectId) : focusProject;
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [showAll, setShowAll] = useState(false);

  if (!project) {
    return (
      <section>
        <h2 className="font-meta mb-3 text-[11px] uppercase tracking-[0.2em] text-muted">Tareas pendientes</h2>
        <Link href="/personal/proyectos" className="block rounded-2xl border border-dashed border-border p-5 text-sm text-muted transition hover:border-accent hover:text-fg">
          Creá un proyecto para empezar a sumar tareas.
        </Link>
      </section>
    );
  }

  const all = tasks.filter((t) => t.projectId === project.id);
  const pending = all
    .filter((t) => !t.done)
    .sort((a, b) => TASK_PRIORITY_ORDER[a.priority] - TASK_PRIORITY_ORDER[b.priority] || b.createdAt - a.createdAt);
  const done = all.filter((t) => t.done).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const shown = showAll ? pending : pending.slice(0, VISIBLE);

  function create() {
    if (!title.trim()) return;
    addTask({ projectId: project!.id, title: title.trim(), priority });
    setTitle('');
    setPriority('medium');
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-meta text-[11px] uppercase tracking-[0.2em] text-muted">Tareas pendientes</h2>
        <button onClick={() => setAdding((v) => !v)} className="text-xs text-muted transition hover:text-fg">
          {adding ? 'Cerrar' : '+ Tarea'}
        </button>
      </div>

      {adding && (
        <div className="pulso-reveal mb-3 rounded-2xl border border-border bg-surface/50 p-3">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="¿Qué hay que hacer?"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted/50"
          />
          <div className="mt-3 flex items-center gap-1.5">
            {(['high', 'medium', 'low'] as TaskPriority[]).map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
                  priority === p ? 'border-accent text-accent' : 'border-border text-muted hover:border-muted'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[p]}`} />
                {TASK_PRIORITY_LABEL[p]}
              </button>
            ))}
            <button onClick={create} disabled={!title.trim()} className="ml-auto rounded-full bg-accent px-3 py-1 text-xs font-medium text-bg disabled:opacity-40">
              Agregar
            </button>
          </div>
        </div>
      )}

      {pending.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface/40 p-4 text-sm text-muted">Sin tareas pendientes. ✦</p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((t) => (
            <li key={t.id} className="group flex items-start gap-3 rounded-xl border border-border bg-surface/40 px-3.5 py-2.5">
              <button
                onClick={() => toggleTask(t.id)}
                title="Marcar como resuelta"
                className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-muted transition hover:border-accent hover:bg-accent/20"
              />
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} title={TASK_PRIORITY_LABEL[t.priority]} />
              <div className="min-w-0">
                <div className="text-sm leading-snug">{t.title}</div>
                {t.note && <div className="mt-0.5 truncate text-xs text-muted">{t.note}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pending.length > VISIBLE && (
        <button onClick={() => setShowAll((v) => !v)} className="font-meta mt-2 text-[11px] uppercase tracking-wide text-muted transition hover:text-fg">
          {showAll ? '↑ Ver menos' : `↓ Ver ${pending.length} tareas pendientes`}
        </button>
      )}

      {done.length > 0 && (
        <div className="mt-5">
          <h3 className="font-meta mb-2 text-[10px] uppercase tracking-[0.18em] text-muted/70">Resueltas hace poco</h3>
          <ul className="space-y-1">
            {done.slice(0, 3).map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-xs text-muted/70">
                <button onClick={() => toggleTask(t.id)} title="Reabrir" className="text-accent/70">✓</button>
                <span className="truncate line-through">{t.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
