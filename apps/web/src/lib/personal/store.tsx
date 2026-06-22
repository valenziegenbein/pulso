'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Store local-first del modo Personal. Todo vive en localStorage (sin cuenta,
 * sin servidor). Más adelante se puede persistir en SQLite + exportar a Markdown.
 */

export type EntryType = 'PROGRESS' | 'RESEARCH' | 'DECISION' | 'BLOCKER' | 'NOTE' | 'DELIVERY';
export type TaskPriority = 'high' | 'medium' | 'low';
export type StorageTarget = 'pulso' | 'markdown' | 'notion' | null;
export type AiMode = 'byok' | 'local' | 'none' | null;

export interface Project {
  id: string;
  name: string;
  context?: string;
  createdAt: number;
}

export interface Entry {
  id: string;
  projectId: string | null;
  type: EntryType;
  title: string;
  content: string;
  createdAt: number;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  note?: string;
  priority: TaskPriority;
  done: boolean;
  createdAt: number;
  completedAt?: number;
}

export interface PersonalState {
  name: string | null;
  onboarded: boolean;
  projects: Project[];
  entries: Entry[];
  tasks: Task[];
  focusProjectId: string | null;
  storage: StorageTarget;
  ai: AiMode;
}

const STORAGE_KEY = 'pulso.personal.v1';
const DEFAULT_STATE: PersonalState = {
  name: null,
  onboarded: false,
  projects: [],
  entries: [],
  tasks: [],
  focusProjectId: null,
  storage: null,
  ai: null,
};

interface PersonalContextValue extends PersonalState {
  ready: boolean;
  focusProject: Project | undefined;
  setName: (name: string) => void;
  addProject: (input: { name: string; context?: string }) => Project;
  addEntry: (input: { projectId?: string | null; type: EntryType; title: string; content: string }) => Entry;
  addTask: (input: { projectId: string; title: string; note?: string; priority?: TaskPriority }) => Task;
  toggleTask: (id: string) => void;
  setFocusProject: (id: string) => void;
  setStorage: (target: StorageTarget) => void;
  setAi: (mode: AiMode) => void;
  completeOnboarding: () => void;
  reset: () => void;
}

const PersonalContext = createContext<PersonalContextValue | null>(null);

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function PersonalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersonalState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<PersonalState>) });
    } catch {
      /* primer uso */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* sin persistencia: seguimos en memoria */
    }
  }, [state, ready]);

  const setName = useCallback((name: string) => setState((s) => ({ ...s, name })), []);
  const setStorage = useCallback((storage: StorageTarget) => setState((s) => ({ ...s, storage })), []);
  const setAi = useCallback((ai: AiMode) => setState((s) => ({ ...s, ai })), []);
  const completeOnboarding = useCallback(() => setState((s) => ({ ...s, onboarded: true })), []);
  const reset = useCallback(() => setState(DEFAULT_STATE), []);
  const setFocusProject = useCallback((focusProjectId: string) => setState((s) => ({ ...s, focusProjectId })), []);

  const addProject = useCallback((input: { name: string; context?: string }) => {
    const project: Project = { id: newId(), name: input.name, context: input.context, createdAt: Date.now() };
    setState((s) => ({
      ...s,
      projects: [project, ...s.projects],
      focusProjectId: s.focusProjectId ?? project.id,
    }));
    return project;
  }, []);

  const addEntry = useCallback(
    (input: { projectId?: string | null; type: EntryType; title: string; content: string }) => {
      const entry: Entry = {
        id: newId(),
        projectId: input.projectId ?? null,
        type: input.type,
        title: input.title,
        content: input.content,
        createdAt: Date.now(),
      };
      setState((s) => ({ ...s, entries: [entry, ...s.entries] }));
      return entry;
    },
    [],
  );

  const addTask = useCallback(
    (input: { projectId: string; title: string; note?: string; priority?: TaskPriority }) => {
      const task: Task = {
        id: newId(),
        projectId: input.projectId,
        title: input.title,
        note: input.note,
        priority: input.priority ?? 'medium',
        done: false,
        createdAt: Date.now(),
      };
      setState((s) => ({ ...s, tasks: [task, ...s.tasks] }));
      return task;
    },
    [],
  );

  const toggleTask = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, done: !t.done, completedAt: !t.done ? Date.now() : undefined } : t,
      ),
    }));
  }, []);

  const focusProject = useMemo(
    () => state.projects.find((p) => p.id === state.focusProjectId) ?? state.projects[0],
    [state.projects, state.focusProjectId],
  );

  const value = useMemo<PersonalContextValue>(
    () => ({
      ...state,
      ready,
      focusProject,
      setName,
      addProject,
      addEntry,
      addTask,
      toggleTask,
      setFocusProject,
      setStorage,
      setAi,
      completeOnboarding,
      reset,
    }),
    [state, ready, focusProject, setName, addProject, addEntry, addTask, toggleTask, setFocusProject, setStorage, setAi, completeOnboarding, reset],
  );

  return <PersonalContext.Provider value={value}>{children}</PersonalContext.Provider>;
}

export function usePersonal(): PersonalContextValue {
  const ctx = useContext(PersonalContext);
  if (!ctx) throw new Error('usePersonal debe usarse dentro de <PersonalProvider>');
  return ctx;
}

export const ENTRY_LABEL: Record<EntryType, string> = {
  PROGRESS: 'Avance',
  RESEARCH: 'Investigación',
  DECISION: 'Decisión',
  BLOCKER: 'Bloqueo',
  NOTE: 'Nota',
  DELIVERY: 'Entrega',
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

export const TASK_PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
