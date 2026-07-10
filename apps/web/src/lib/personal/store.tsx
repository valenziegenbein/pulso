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
export type AiProvider = 'lmstudio' | 'ollama' | 'openai' | 'anthropic' | 'custom';

/** Conexión concreta a un proveedor LLM (local OpenAI-compatible o cloud BYOK). */
export interface AiConfig {
  provider: AiProvider;
  /** Base del proveedor. Local: http://localhost:1234/v1 · Cloud: la fuerza el server. */
  baseUrl: string;
  model: string;
  /** Solo cloud (BYOK). Vive solo en este equipo; nunca vuelve del server. */
  apiKey?: string;
  /** Solo local: modelo de embeddings (distinto al de chat), para búsqueda
   *  semántica en la bóveda. OpenAI usa un modelo fijo; Anthropic no ofrece. */
  embeddingsModel?: string;
}

export interface Project {
  id: string;
  name: string;
  context?: string;
  /** Carpeta Markdown propia (p. ej. dentro de tu bóveda Obsidian). Si falta,
   *  se usa la carpeta general de Ajustes. */
  markdownDir?: string | null;
  /** Opt-in: leer las notas recientes de la carpeta como contexto para la IA. */
  useNotesContext?: boolean;
  createdAt: number;
}

export interface Entry {
  id: string;
  projectId: string | null;
  type: EntryType;
  title: string;
  content: string;
  /** Captura/imagen adjunta, como data URL (downscaleada). Opcional. */
  image?: string;
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
  /** Carpeta destino cuando storage === 'markdown' (solo desktop). */
  storageDir: string | null;
  ai: AiMode;
  aiConfig: AiConfig | null;
  /** Búsqueda semántica en la bóveda (etapa 2b, opt-in explícito). Requiere un
   *  proveedor con embeddings (no Anthropic) y, si es local, embeddingsModel. */
  embeddingsEnabled: boolean;
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
  storageDir: null,
  ai: null,
  aiConfig: null,
  embeddingsEnabled: false,
};

interface PersonalContextValue extends PersonalState {
  ready: boolean;
  focusProject: Project | undefined;
  setName: (name: string) => void;
  addProject: (input: { name: string; context?: string }) => Project;
  updateProjectContext: (id: string, context: string) => void;
  addEntry: (input: { projectId?: string | null; type: EntryType; title: string; content: string; image?: string }) => Entry;
  addTask: (input: { projectId: string; title: string; note?: string; priority?: TaskPriority }) => Task;
  toggleTask: (id: string) => void;
  setFocusProject: (id: string) => void;
  setStorage: (target: StorageTarget) => void;
  setStorageDir: (dir: string | null) => void;
  setProjectMarkdownDir: (id: string, dir: string | null) => void;
  setProjectNotesContext: (id: string, on: boolean) => void;
  setEmbeddingsEnabled: (on: boolean) => void;
  setAi: (mode: AiMode) => void;
  setAiConfig: (config: AiConfig | null) => void;
  completeOnboarding: () => void;
  reset: () => void;
}

const PersonalContext = createContext<PersonalContextValue | null>(null);

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// --- Export a carpeta Markdown (desktop) -----------------------------------
// Formato "archivo diario": <carpeta>/Bitácora/YYYY-MM-DD.md. Pulso es un
// huésped educado en tu bóveda: NUNCA edita notas existentes, solo agrega a sus
// propios archivos diarios (identificables por `fuente: pulso`).
type ShellBridge = {
  isDesktop?: boolean;
  exportMarkdown?: (payload: { dir: string; subdir?: string; fileName: string; text: string; header?: string }) => Promise<boolean>;
};
function shellBridge(): ShellBridge | undefined {
  return typeof window !== 'undefined' ? (window as unknown as { pulso?: ShellBridge }).pulso : undefined;
}

/** Fecha local YYYY-MM-DD (nombre del archivo diario). */
function localDateStamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Sección .md de una entrada aprobada dentro del archivo diario. */
function entryToDailyBlock(entry: Entry): string {
  const hhmm = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(entry.createdAt);
  const lines = [`## ${hhmm} · ${ENTRY_LABEL[entry.type]} — ${entry.title}`, ''];
  if (entry.content.trim()) lines.push(entry.content.trim(), '');
  if (entry.image) lines.push('*(captura adjunta en Pulso)*', '');
  return `\n${lines.join('\n')}`;
}

/** Frontmatter + título, solo al crear el archivo del día. */
function dailyHeader(stamp: string): string {
  return `---\nfuente: pulso\nfecha: ${stamp}\n---\n\n# Bitácora — ${stamp}\n`;
}

/** Fire-and-forget: agrega la entrada al archivo diario del proyecto. */
function exportEntryToFolder(entry: Entry, dir: string): void {
  const b = shellBridge();
  if (!b?.isDesktop || !b.exportMarkdown) return;
  const stamp = localDateStamp(entry.createdAt);
  void b
    .exportMarkdown({
      dir,
      subdir: 'Bitácora',
      fileName: stamp,
      text: entryToDailyBlock(entry),
      header: dailyHeader(stamp),
    })
    .catch(() => {
      /* export voluntario: si falla, la entrada sigue guardada en Pulso */
    });
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
      const serialized = JSON.stringify(state);
      // Evita reescrituras innecesarias (corta el eco del sync entre ventanas).
      if (localStorage.getItem(STORAGE_KEY) !== serialized) localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      /* sin persistencia: seguimos en memoria */
    }
  }, [state, ready]);

  // Sync entre ventanas (la app y el widget comparten el mismo origen).
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setState({ ...DEFAULT_STATE, ...(JSON.parse(e.newValue) as Partial<PersonalState>) });
        } catch {
          /* ignora payloads inválidos */
        }
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setName = useCallback((name: string) => setState((s) => ({ ...s, name })), []);
  const setStorage = useCallback((storage: StorageTarget) => setState((s) => ({ ...s, storage })), []);
  const setStorageDir = useCallback((storageDir: string | null) => setState((s) => ({ ...s, storageDir })), []);
  const setAi = useCallback((ai: AiMode) => setState((s) => ({ ...s, ai })), []);
  const setAiConfig = useCallback((aiConfig: AiConfig | null) => setState((s) => ({ ...s, aiConfig })), []);
  const setEmbeddingsEnabled = useCallback((embeddingsEnabled: boolean) => setState((s) => ({ ...s, embeddingsEnabled })), []);
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

  const updateProjectContext = useCallback((id: string, context: string) => {
    setState((s) => ({ ...s, projects: s.projects.map((p) => (p.id === id ? { ...p, context } : p)) }));
  }, []);

  const setProjectMarkdownDir = useCallback((id: string, markdownDir: string | null) => {
    setState((s) => ({ ...s, projects: s.projects.map((p) => (p.id === id ? { ...p, markdownDir } : p)) }));
  }, []);

  const setProjectNotesContext = useCallback((id: string, useNotesContext: boolean) => {
    setState((s) => ({ ...s, projects: s.projects.map((p) => (p.id === id ? { ...p, useNotesContext } : p)) }));
  }, []);

  const addEntry = useCallback(
    (input: { projectId?: string | null; type: EntryType; title: string; content: string; image?: string }) => {
      const entry: Entry = {
        id: newId(),
        projectId: input.projectId ?? null,
        type: input.type,
        title: input.title,
        content: input.content,
        image: input.image,
        createdAt: Date.now(),
      };
      setState((s) => ({ ...s, entries: [entry, ...s.entries] }));
      // Export voluntario: cada proyecto puede tener su propia carpeta Markdown
      // (p. ej. su bóveda Obsidian); si no tiene, cae a la carpeta general de
      // Ajustes (solo cuando el guardado elegido es 'markdown'). No bloquea.
      const project = state.projects.find((p) => p.id === entry.projectId);
      const dir = project?.markdownDir ?? (state.storage === 'markdown' ? state.storageDir : null);
      if (dir) exportEntryToFolder(entry, dir);
      return entry;
    },
    [state.storage, state.storageDir, state.projects],
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
      updateProjectContext,
      addEntry,
      addTask,
      toggleTask,
      setFocusProject,
      setStorage,
      setStorageDir,
      setProjectMarkdownDir,
      setProjectNotesContext,
      setAi,
      setAiConfig,
      setEmbeddingsEnabled,
      completeOnboarding,
      reset,
    }),
    [state, ready, focusProject, setName, addProject, updateProjectContext, addEntry, addTask, toggleTask, setFocusProject, setStorage, setStorageDir, setProjectMarkdownDir, setProjectNotesContext, setAi, setAiConfig, setEmbeddingsEnabled, completeOnboarding, reset],
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
