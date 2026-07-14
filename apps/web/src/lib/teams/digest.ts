// SERVER-ONLY. Arma el "pulso" del equipo: una traduccion en prosa de la
// actividad reciente, pensada para un lider que quiere leer, no gestionar.
import { getOrganizationLLMProvider } from '@/lib/llm';

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

export function peopleToWatch(perPerson: PersonLike[]): PersonLike[] {
  return perPerson.filter((p) => p.active >= 4 || p.high >= 2 || p.blocked > 0);
}

export function heuristicPulse(input: PulseInput): string {
  const parts: string[] = [];
  const { recentWorklog, decisions, openBlockers } = input;

  if (recentWorklog.length > 0) {
    const highlights = recentWorklog.slice(0, 2).map((w) => `${teamOf(w)} ${VERB[w.type] ?? 'trabajo en'} ${lowerFirst(w.title)}`);
    parts.push(`Lo último que se movió: ${joinNatural(highlights)}.`);
  }
  if (decisions.length > 0) {
    const d = decisions[0]!;
    parts.push(`Te ${decisions.length === 1 ? 'espera' : 'esperan'} ${plural(decisions.length, 'decisión', 'decisiones')}: la primera, "${d.title}" en ${d.team.name}.`);
  }
  if (openBlockers.length > 0) {
    const b = openBlockers[0]!;
    const bteam = b.task?.team?.name ?? b.team?.name;
    parts.push(`Hay ${plural(openBlockers.length, 'bloqueo abierto', 'bloqueos abiertos')}${bteam ? `, el más fresco en ${bteam}` : ''}: ${lowerFirst(b.title)}.`);
  }
  const watch = peopleToWatch(input.perPerson);
  if (watch.length > 0) {
    parts.push(`${watch[0]!.user.name} viene con varias tareas activas (${watch[0]!.active}); conviene cuidar su semana.`);
  }

  if (parts.length === 0) return 'Semana tranquila: todavía no hay avances publicados ni pendientes que necesiten tu atención.';
  return parts.join(' ');
}

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join('; ')} y ${items[items.length - 1]}`;
}

const FACTS_BUDGET = 3000;
const LINE_BUDGET = 160;

function fact(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= LINE_BUDGET ? t : `${t.slice(0, LINE_BUDGET - 1)}...`;
}

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

  const top = 10;
  const lines = ['Estado por equipo:'];
  rollup.slice(0, top).forEach((t) =>
    lines.push(fact(`- ${t.name}: ${t.active} activas, ${t.blockers} bloqueos${t.last ? `, ultimo: ${t.last}` : ''}`)),
  );
  if (rollup.length > top) lines.push(`- y ${rollup.length - top} equipos mas`);
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

const SYSTEM_PROMPT = `Sos el asistente de un lider de equipo. Escribis el "pulso" del trabajo: una traduccion en prosa de la actividad reciente, para que la persona se ponga al dia en 30 segundos.

Reglas estrictas:
- 2 a 4 frases, espanol neutro, calido y concreto. Texto plano, sin vinetas ni JSON.
- Primero conta los avances; despues lo que necesita atencion (decisiones, luego bloqueos, luego carga a cuidar).
- Si hay muchos equipos, sintetiza patrones; no enumeres equipo por equipo.
- NUNCA inventes datos que no esten en los hechos.
- Esto NO es vigilancia: describi el trabajo y su intencion, nunca el comportamiento ni la productividad de las personas.
- Hablale al lider de vos.`;

export async function buildTeamPulse(input: PulseInput, organizationId: string): Promise<TeamPulse> {
  const heuristic = heuristicPulse(input);
  const { provider, source } = await getOrganizationLLMProvider(organizationId);
  if (source !== 'db') return { text: heuristic, source: 'heuristic' };

  try {
    const { text } = await provider.complete({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildFacts(input) || 'Sin actividad reciente.' },
      ],
      temperature: 0.4,
      maxTokens: 900,
    });
    const clean = text.trim();
    return clean.length > 40 ? { text: clean, source: 'ai' } : { text: heuristic, source: 'heuristic' };
  } catch {
    return { text: heuristic, source: 'heuristic' };
  }
}
