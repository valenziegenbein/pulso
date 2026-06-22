'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Store local-first del modo Personal. Todo vive en localStorage (sin cuenta,
 * sin servidor). Más adelante se puede persistir en SQLite + exportar a Markdown.
 */

export type EntryType =
  | 'PROGRESS'
  | 'RESEARCH'
  | 'DECISION'
  | 'BLOCKER'
  | 'NOTE'
  | 'DELIVERY';

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

export interface PersonalState {
  name: string | null;
  onboarded: boolean;
  projects: Project[];
  entries: Entry[];
  storage: StorageTarget;
  ai: AiMode;
}

const STORAGE_KEY = 'pulso.personal.v1';
const DEFAULT_STATE: PersonalState = {
  name: null,
  onboarded: false,
  projects: [],
  entries: [],
  storage: null,
  ai: null,
};

interface PersonalContextValue extends PersonalState {
  ready: boolean;
  setName: (name: string) => void;
  addProject: (input: { name: string; context?: string }) => Project;
  addEntry: (input: { projectId?: string | null; type: EntryType; title: string; content: string }) => Entry;
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

  const addProject = useCallback((input: { name: string; context?: string }) => {
    const project: Project = { id: newId(), name: input.name, context: input.context, createdAt: Date.now() };
    setState((s) => ({ ...s, projects: [project, ...s.projects] }));
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

  const value = useMemo<PersonalContextValue>(
    () => ({ ...state, ready, setName, addProject, addEntry, setStorage, setAi, completeOnboarding, reset }),
    [state, ready, setName, addProject, addEntry, setStorage, setAi, completeOnboarding, reset],
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
