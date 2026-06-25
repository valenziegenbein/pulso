'use client';

import { useState } from 'react';
import { TASK_PRIORITY } from '@pulso/shared';
import { createTaskAction } from '@/server/actions/tasks';
import { PRIORITY_LABEL } from '@/lib/labels';
import { TaskSuggestionPanel } from './task-suggestion-panel';
import { btnPrimary, inputCls, selectCls, textareaCls } from './ui';

interface Option {
  id: string;
  name: string;
}

/**
 * Encabezado de Tareas: título + acciones. Los formularios (nuevo proyecto /
 * asignar con IA) viven DETRÁS de los botones (se revelan al tocarlos) para
 * mantener la vista limpia: proyectos + tareas activas, nada más.
 */
export function TasksCreate({ teams, people }: { teams: Option[]; people: Option[] }) {
  const [open, setOpen] = useState<'project' | 'ia' | null>(null);
  const toggle = (which: 'project' | 'ia') => setOpen((o) => (o === which ? null : which));

  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-meta mb-2 text-[11px] uppercase tracking-[0.22em] text-accent">Trabajo del equipo</p>
          <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">Tareas</h1>
          <p className="mt-2 max-w-xl text-muted">Tus proyectos y las tareas activas de cada uno.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => toggle('project')} className={btnPrimary}>
            {open === 'project' ? 'Cerrar' : '+ Nuevo proyecto'}
          </button>
          <button
            onClick={() => toggle('ia')}
            className={`rounded-full border px-4 py-2 text-sm transition ${
              open === 'ia' ? 'border-accent text-accent' : 'border-border text-muted hover:border-accent hover:text-fg'
            }`}
          >
            ✦ Asignar con IA
          </button>
        </div>
      </div>

      {open === 'project' && (
        <div className="pulso-reveal mt-5 rounded-2xl border border-border bg-surface/60 p-5">
          <p className="font-meta mb-3 text-[11px] uppercase tracking-[0.2em] text-muted">Nuevo proyecto</p>
          <form action={createTaskAction} className="grid gap-2.5 sm:grid-cols-2">
            <input name="title" required placeholder="Nombre del proyecto" className={`${inputCls} sm:col-span-2`} />
            <textarea name="description" rows={2} placeholder="Directiva / de qué se trata" className={`${textareaCls} sm:col-span-2`} />
            <input name="expectedOutcome" placeholder="Resultado esperado" className={inputCls} />
            <input name="definitionOfDone" placeholder="Definición de terminado" className={inputCls} />
            <select name="teamId" required className={selectCls} defaultValue={teams[0]?.id ?? ''}>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <select name="assigneeId" className={selectCls} defaultValue="">
              <option value="">Sin responsable</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            <select name="priority" defaultValue="MEDIUM" className={selectCls}>
              {TASK_PRIORITY.filter((p) => p !== 'URGENT').map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
            <button className="rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-bg transition hover:brightness-110 sm:col-span-2">
              Crear proyecto
            </button>
          </form>
        </div>
      )}

      {open === 'ia' && (
        <div className="pulso-reveal mt-5">
          <TaskSuggestionPanel teams={teams} people={people} />
        </div>
      )}
    </div>
  );
}
