'use client';

import { useState } from 'react';
import { usePersonal } from '@/lib/personal/store';

function relative(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(ts);
}

export default function ProyectosPage() {
  const { projects, entries, addProject } = usePersonal();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [ctx, setCtx] = useState('');

  function create() {
    if (!name.trim()) return;
    addProject({ name: name.trim(), context: ctx.trim() || undefined });
    setName('');
    setCtx('');
    setOpen(false);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <header className="mb-8 flex items-end justify-between">
        <h1 className="font-display text-4xl sm:text-5xl">Proyectos</h1>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition hover:brightness-110"
        >
          {open ? 'Cerrar' : '+ Nuevo proyecto'}
        </button>
      </header>

      {open && (
        <div className="pulso-reveal mb-8 rounded-2xl border border-border bg-surface/50 p-5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del proyecto"
            className="w-full border-b border-border bg-transparent pb-2 font-display text-2xl outline-none placeholder:text-muted/40 focus:border-accent"
          />
          <textarea
            value={ctx}
            onChange={(e) => setCtx(e.target.value)}
            rows={2}
            placeholder="¿De qué trata? (opcional)"
            className="mt-4 w-full resize-none rounded-xl border border-border bg-bg/60 p-3 text-sm outline-none placeholder:text-muted/50 focus:border-accent"
          />
          <button onClick={create} disabled={!name.trim()} className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg disabled:opacity-40">
            Crear proyecto
          </button>
        </div>
      )}

      {projects.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-muted">
          Todavía no tenés proyectos. Creá el primero para empezar a capturar avances.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => {
            const count = entries.filter((e) => e.projectId === p.id).length;
            const last = entries.find((e) => e.projectId === p.id);
            return (
              <li key={p.id} className="rounded-2xl border border-border bg-surface/40 p-5">
                <div className="font-display text-2xl">{p.name}</div>
                {p.context && <p className="mt-2 line-clamp-2 text-sm text-muted">{p.context}</p>}
                <div className="font-meta mt-4 flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted">
                  <span>{count} {count === 1 ? 'entrada' : 'entradas'}</span>
                  <span>·</span>
                  <span>{last ? relative(last.createdAt) : 'sin avances'}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
