// SERVER-ONLY. Arma el "pulso" del equipo: una traducción en prosa de la
// actividad reciente, pensada para un líder que quiere leer, no gestionar.
//
// Si hay un proveedor LLM real configurado, lo usa; si no (MOCK por defecto),
// cae a un resumen heurístico que igual se lee como un brief humano.
import { getConfiguredProvider } from '@/lib/llm';

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

export interface PulseInput {
  recentWorklog: WorklogLike[];
  openBlockers: BlockerLike[];
  decisions: DecisionLike[];
  perPerson: PersonLike[];
  teams: Array<{ name: string }>;
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
function heuristicPulse(input: PulseInput): string {
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

function buildFacts(input: PulseInput): string {
  const lines: string[] = [];
  if (input.recentWorklog.length) {
    lines.push('Avances publicados (más recientes primero):');
    input.recentWorklog.slice(0, 6).forEach((w) => lines.push(`- [${w.type}] ${teamOf(w)}: ${w.title} (${w.author.name})`));
  }
  if (input.decisions.length) {
    lines.push('Decisiones pendientes:');
    input.decisions.forEach((d) => lines.push(`- ${d.team.name}: ${d.title}`));
  }
  if (input.openBlockers.length) {
    lines.push('Bloqueos abiertos:');
    input.openBlockers.slice(0, 5).forEach((b) => lines.push(`- ${b.task?.team?.name ?? b.team?.name ?? 'Equipo'}: ${b.title}`));
  }
  const watch = peopleToWatch(input.perPerson);
  if (watch.length) {
    lines.push('Personas con carga a cuidar:');
    watch.forEach((p) => lines.push(`- ${p.user.name}: ${p.active} activas`));
  }
  return lines.join('\n');
}

const SYSTEM_PROMPT = `Sos el asistente de un líder de equipo. Escribís el "pulso" del trabajo: una traducción en prosa de la actividad reciente, para que la persona se ponga al día en 30 segundos.

Reglas estrictas:
- 2 a 4 frases, español neutro, cálido y concreto. Texto plano, sin viñetas ni JSON.
- Primero contá los avances; después lo que necesita atención (decisiones, luego bloqueos, luego carga a cuidar).
- NUNCA inventes datos que no estén en los hechos. Si algo no está, no lo menciones.
- Esto NO es vigilancia: describí el trabajo y su intención, nunca el comportamiento ni la productividad de las personas.
- Hablale al líder de vos.`;

/** Genera el pulso: LLM real si está configurado, si no heurístico. */
export async function buildTeamPulse(input: PulseInput): Promise<TeamPulse> {
  const heuristic = heuristicPulse(input);
  const { provider, isReal } = getConfiguredProvider();
  if (!isReal) return { text: heuristic, source: 'heuristic' };

  try {
    const { text } = await provider.complete({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildFacts(input) || 'Sin actividad reciente.' },
      ],
      temperature: 0.4,
      maxTokens: 320,
    });
    const clean = text.trim();
    return clean.length > 40 ? { text: clean, source: 'ai' } : { text: heuristic, source: 'heuristic' };
  } catch {
    return { text: heuristic, source: 'heuristic' };
  }
}
