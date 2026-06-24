// SERVER-ONLY. Arma el "pulso" del equipo: una traducción en prosa de la
// actividad reciente, pensada para un líder que quiere leer, no gestionar.
//
// Si hay un proveedor LLM real configurado, lo usa; si no (MOCK por defecto),
// cae a un resumen heurístico que igual se lee como un brief humano.
import { createLLMProvider, type LLMProvider } from '@pulso/llm';
import { getEnvLLMConfig } from '@/lib/llm';
import { fetchWithTimeout } from '@/lib/personal/ai-endpoint';

interface WorklogLike {
  type: string;
  title: string;
  author: { name: string };
  team: { name: string } | null;
  task: { team: { name: string } } | null;
}
interface BlockerLike {
  title: string;
  task: { team: { name: string } | null } | null;
  team: { name: string } | null;
}
interface DecisionLike {
  title: string;
  team: { name: string };
}
interface PersonLike {
  user: { name: string };
  active: number;
  high: number;
  blocked: number;
}

interface TeamLike {
  name: string;
  /** Tareas activas del equipo (ya filtradas por la query). */
  tasks: Array<{ blockers: unknown[]; worklogEntries: Array<{ title: string }> }>;
  blockers: unknown[];
}

export interface PulseInput {
  recentWorklog: WorklogLike[];
  openBlockers: BlockerLike[];
  decisions: DecisionLike[];
  perPerson: PersonLike[];
  teams: TeamLike[];
}

export interface TeamPulse {
  text: string;
  source: 'ai' | 'heuristic';
}

const VERB: Record<string, string> = {
  PROGRESS: 'avanzó en',
  DELIVERY: 'entregó',
  RESEARCH: 'investigó',
  DECISION: 'definió',
  NOTE: 'anotó',
  BLOCKER: 'reportó un bloqueo en',
};

function teamOf(w: WorklogLike): string {
  return w.team?.name ?? w.task?.team?.name ?? 'Un equipo';
}
function lowerFirst(s: string): string {
  return s ? s[0]!.toLowerCase() + s.slice(1) : s;
}
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Personas a cuidar: regla simple y conservadora (sin vigilancia). */
export function peopleToWatch(perPerson: PersonLike[]): PersonLike[] {
  return perPerson.filter((p) => p.active >= 4 || p.high >= 2 || p.blocked > 0);
}

/** Resumen heurístico: siempre legible, sin red ni IA. */
export function heuristicPulse(input: PulseInput): string {
  const parts: string[] = [];
  const { recentWorklog, decisions, openBlockers } = input;

  if (recentWorklog.length > 0) {
    const highlights = recentWorklog.slice(0, 2).map((w) => `${teamOf(w)} ${VERB[w.type] ?? 'trabajó en'} ${lowerFirst(w.title)}`);
    parts.push(`Lo último que se movió: ${joinNatural(highlights)}.`);
  }

  if (decisions.length > 0) {
    const d = decisions[0]!;
    parts.push(`Te ${decisions.length === 1 ? 'espera' : 'esperan'} ${plural(decisions.length, 'decisión', 'decisiones')} — la primera, "${d.title}" en ${d.team.name}.`);
  }

  if (openBlockers.length > 0) {
    const b = openBlockers[0]!;
    const bteam = b.task?.team?.name ?? b.team?.name;
    parts.push(`Hay ${plural(openBlockers.length, 'bloqueo abierto', 'bloqueos abiertos')}${bteam ? `, el más fresco en ${bteam}` : ''}: ${lowerFirst(b.title)}.`);
  }

  const watch = peopleToWatch(input.perPerson);
  if (watch.length > 0) {
    parts.push(`${watch[0]!.user.name} viene con varias tareas activas (${watch[0]!.active}) — conviene cuidar su semana.`);
  }

  if (parts.length === 0) {
    return 'Semana tranquila: todavía no hay avances publicados ni pendientes que necesiten tu atención.';
  }
  return parts.join(' ');
}

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join('; ')} y ${items[items.length - 1]}`;
}

// Presupuesto de los "hechos" que van al prompt. Las queries ya topean los ítems
// (take: 6/5/10); esto acota además el largo total y de cada línea, para que el
// pulso no rompa la ventana del modelo aunque los títulos sean largos.
// (Para escalas grandes, el paso siguiente es map-reduce: resumir por equipo y
//  después combinar; con los topes actuales todavía no hace falta.)
const FACTS_BUDGET = 3000;
const LINE_BUDGET = 160;

function fact(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= LINE_BUDGET ? t : `${t.slice(0, LINE_BUDGET - 1)}…`;
}

// MAP: rollup por equipo. Cubre toda la organización (no solo los últimos 6
// avances) en tamaño acotado, con UNA sola llamada al LLM (el reduce de buildFacts).
function teamRollupLines(teams: TeamLike[]): string[] {
  const rollup = teams
    .map((t) => ({
      name: t.name,
      active: t.tasks.length,
      blockers: t.blockers.length + t.tasks.reduce((s, x) => s + x.blockers.length, 0),
      last: t.tasks.flatMap((x) => x.worklogEntries)[0]?.title,
    }))
    .filter((t) => t.active > 0 || t.blockers > 0)
    .sort((a, b) => b.blockers - a.blockers || b.active - a.active);
  if (rollup.length === 0) return [];

  const TOP = 10;
  const lines = ['Estado por equipo:'];
  rollup.slice(0, TOP).forEach((t) =>
    lines.push(fact(`- ${t.name}: ${t.active} activas, ${t.blockers} bloqueos${t.last ? `, último: ${t.last}` : ''}`)),
  );
  if (rollup.length > TOP) lines.push(`- y ${rollup.length - TOP} equipos más`);
  return lines;
}

function buildFacts(input: PulseInput): string {
  const lines: string[] = [...teamRollupLines(input.teams)];
  if (input.recentWorklog.length) {
    lines.push('Avances recientes destacados:');
    input.recentWorklog.slice(0, 6).forEach((w) => lines.push(fact(`- [${w.type}] ${teamOf(w)}: ${w.title} (${w.author.name})`)));
  }
  if (input.decisions.length) {
    lines.push('Decisiones pendientes:');
    input.decisions.forEach((d) => lines.push(fact(`- ${d.team.name}: ${d.title}`)));
  }
  if (input.openBlockers.length) {
    lines.push('Bloqueos abiertos:');
    input.openBlockers.slice(0, 5).forEach((b) => lines.push(fact(`- ${b.task?.team?.name ?? b.team?.name ?? 'Equipo'}: ${b.title}`)));
  }
  const watch = peopleToWatch(input.perPerson);
  if (watch.length) {
    lines.push('Personas con carga a cuidar:');
    watch.forEach((p) => lines.push(fact(`- ${p.user.name}: ${p.active} activas`)));
  }
  return lines.join('\n').slice(0, FACTS_BUDGET);
}

const SYSTEM_PROMPT = `Sos el asistente de un líder de equipo. Escribís el "pulso" del trabajo: una traducción en prosa de la actividad reciente, para que la persona se ponga al día en 30 segundos.

Reglas estrictas:
- 2 a 4 frases, español neutro, cálido y concreto. Texto plano, sin viñetas ni JSON.
- Primero contá los avances; después lo que necesita atención (decisiones, luego bloqueos, luego carga a cuidar).
- Si hay muchos equipos, sintetizá los patrones (qué áreas avanzan, dónde se traba), no enumeres equipo por equipo.
- NUNCA inventes datos que no estén en los hechos. Si algo no está, no lo menciones.
- Esto NO es vigilancia: describí el trabajo y su intención, nunca el comportamiento ni la productividad de las personas.
- Hablale al líder de vos.`;

/** Servidores LLM locales OpenAI-compatible que probamos por defecto. */
const LOCAL_LLM_PORTS = [1234, 11434]; // LM Studio · Ollama

/**
 * Resuelve un provider para el pulso:
 * 1) si hay uno configurado por entorno (no MOCK), ese;
 * 2) si no, auto-detecta un modelo local en loopback (LM Studio / Ollama);
 * 3) si no hay nada, null → el caller usa el heurístico.
 */
// Los modelos locales (sobre todo los de razonamiento) son lentos: damos aire.
const COMPLETION_TIMEOUT_MS = 120_000;

async function resolveTeamsProvider(): Promise<LLMProvider | null> {
  const { config, isReal } = getEnvLLMConfig();
  if (isReal) {
    return createLLMProvider({ ...config, fetchImpl: fetchWithTimeout(COMPLETION_TIMEOUT_MS) });
  }
  for (const port of LOCAL_LLM_PORTS) {
    const baseUrl = `http://localhost:${port}/v1`;
    try {
      const res = await fetchWithTimeout(1500)(`${baseUrl}/models`);
      if (!res.ok) continue;
      const data = (await res.json()) as { data?: Array<{ id?: string }> };
      const ids = (data.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
      // Evitamos modelos de embeddings; preferimos el más liviano si lo distinguimos.
      const model = ids.find((id) => !/embed/i.test(id)) ?? ids[0];
      if (model) {
        return createLLMProvider({ type: 'OPENAI_COMPATIBLE', baseUrl, model, fetchImpl: fetchWithTimeout(COMPLETION_TIMEOUT_MS) });
      }
    } catch {
      /* probamos el siguiente */
    }
  }
  return null;
}

/** Genera el pulso: LLM (configurado o local auto-detectado) si hay; si no, heurístico. */
export async function buildTeamPulse(input: PulseInput): Promise<TeamPulse> {
  const heuristic = heuristicPulse(input);
  const provider = await resolveTeamsProvider();
  if (!provider) return { text: heuristic, source: 'heuristic' };

  try {
    const { text } = await provider.complete({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildFacts(input) || 'Sin actividad reciente.' },
      ],
      temperature: 0.4,
      // Generoso: los modelos de razonamiento gastan tokens "pensando" antes de
      // escribir la respuesta; con poco presupuesto devuelven content vacío.
      maxTokens: 900,
    });
    const clean = text.trim();
    return clean.length > 40 ? { text: clean, source: 'ai' } : { text: heuristic, source: 'heuristic' };
  } catch {
    return { text: heuristic, source: 'heuristic' };
  }
}
