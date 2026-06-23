import type { TaskPriority } from '@pulso/shared';
import type { LLMProvider } from './provider';

export interface TaskSuggestionMember {
  id: string;
  name: string;
  role?: string;
  teamIds?: string[];
  activeTasks?: number;
}

export interface TaskSuggestionInput {
  instruction: string;
  organizationName?: string;
  team?: { id: string; name: string; description?: string | null; focus?: string | null };
  assigneeId?: string;
  members?: TaskSuggestionMember[];
  activeTasks?: Array<{ title: string; assigneeName?: string | null; priority?: string; status?: string }>;
}

export interface TaskSuggestion {
  title: string;
  description: string;
  expectedOutcome?: string;
  definitionOfDone?: string;
  suggestedPriority: TaskPriority;
  suggestedAssigneeId?: string;
  dueDate?: string;
  reasoning?: string;
}

const SYSTEM_PROMPT = `Sos un asistente que ayuda a un lider a convertir instrucciones vagas en tareas claras para un equipo.

Reglas:
- No inventes personas, resultados ni fechas que no esten sugeridas por el contexto.
- La IA NO asigna ni publica nada: solo propone para aprobacion humana.
- Priorizá claridad, resultado esperado y definicion de terminado.
- Usá prioridad LOW, MEDIUM o HIGH. Evitá URGENT salvo que la instruccion diga urgencia explicita.
- Si sugeris responsable, usá solo un id de miembro incluido en el contexto.

Responde EXCLUSIVAMENTE con JSON valido:
{"title":"...","description":"...","expectedOutcome":"...","definitionOfDone":"...","suggestedPriority":"LOW|MEDIUM|HIGH","suggestedAssigneeId":"id opcional","dueDate":"YYYY-MM-DD opcional","reasoning":"por que se sugiere"}`;

const PRIORITIES = new Set<TaskPriority>(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

export class TaskSuggestionService {
  constructor(private readonly provider: LLMProvider) {}

  async suggest(input: TaskSuggestionInput): Promise<TaskSuggestion> {
    const { text } = await this.provider.complete({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(input) },
      ],
      temperature: 0.2,
      maxTokens: 700,
    });
    return parseTaskSuggestion(text, input);
  }
}

export function fallbackTaskSuggestion(input: TaskSuggestionInput): TaskSuggestion {
  const instruction = input.instruction.trim();
  const teamName = input.team?.name;
  const title = toTitle(instruction);
  const suggestedAssigneeId = pickAssignee(input);
  const priority: TaskPriority = /urgente|alta prioridad|bloque|riesgo|crit/i.test(instruction) ? 'HIGH' : 'MEDIUM';

  return {
    title,
    description: teamName
      ? `${instruction}. Coordinar el trabajo con el equipo de ${teamName} y registrar avances relevantes.`
      : `${instruction}. Coordinar responsables, alcance y proximos pasos antes de ejecutar.`,
    expectedOutcome: `Resultado claro y compartido sobre: ${instruction}.`,
    definitionOfDone: 'La tarea fue revisada por el responsable, el resultado esperado esta documentado y los proximos pasos quedaron definidos.',
    suggestedPriority: priority,
    suggestedAssigneeId,
    reasoning: suggestedAssigneeId
      ? 'Sugerencia local: se eligio una persona del equipo con menor carga visible.'
      : 'Sugerencia local: no hay responsable claro en el contexto.',
  };
}

function buildPrompt(input: TaskSuggestionInput): string {
  const lines = [`Instruccion: "${input.instruction}"`];
  if (input.organizationName) lines.push(`Organizacion: ${input.organizationName}`);
  if (input.team) {
    lines.push(`Equipo elegido: ${input.team.name} (${input.team.id})`);
    if (input.team.focus) lines.push(`Foco del equipo: ${input.team.focus}`);
    if (input.team.description) lines.push(`Descripcion del equipo: ${input.team.description}`);
  }
  if (input.assigneeId) lines.push(`Responsable preseleccionado: ${input.assigneeId}`);
  if (input.members?.length) {
    lines.push('Miembros disponibles:');
    for (const m of input.members.slice(0, 20)) {
      lines.push(`- ${m.id}: ${m.name}${m.role ? ` (${m.role})` : ''}, tareas activas: ${m.activeTasks ?? 0}`);
    }
  }
  if (input.activeTasks?.length) {
    lines.push('Tareas activas relevantes:');
    for (const task of input.activeTasks.slice(0, 12)) {
      lines.push(`- ${task.title}${task.assigneeName ? ` - ${task.assigneeName}` : ''} - ${task.priority ?? 'MEDIUM'} - ${task.status ?? 'TODO'}`);
    }
  }
  return lines.join('\n');
}

function parseTaskSuggestion(text: string, input: TaskSuggestionInput): TaskSuggestion {
  const fallback = fallbackTaskSuggestion(input);
  const raw = text.match(/\{[\s\S]*\}/)?.[0];
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Partial<TaskSuggestion>;
    const priority = typeof parsed.suggestedPriority === 'string' && PRIORITIES.has(parsed.suggestedPriority as TaskPriority)
      ? (parsed.suggestedPriority as TaskPriority)
      : fallback.suggestedPriority;
    return {
      title: stringOr(parsed.title, fallback.title).slice(0, 200),
      description: stringOr(parsed.description, fallback.description).slice(0, 5000),
      expectedOutcome: optionalString(parsed.expectedOutcome, fallback.expectedOutcome),
      definitionOfDone: optionalString(parsed.definitionOfDone, fallback.definitionOfDone),
      suggestedPriority: priority === 'URGENT' ? 'HIGH' : priority,
      suggestedAssigneeId: validAssignee(parsed.suggestedAssigneeId, input) ?? fallback.suggestedAssigneeId,
      dueDate: typeof parsed.dueDate === 'string' ? parsed.dueDate : undefined,
      reasoning: optionalString(parsed.reasoning, fallback.reasoning),
    };
  } catch {
    return fallback;
  }
}

function pickAssignee(input: TaskSuggestionInput): string | undefined {
  if (input.assigneeId) return input.assigneeId;
  const teamMemberIds = new Set(input.team ? input.members?.filter((m) => m.teamIds?.includes(input.team!.id)).map((m) => m.id) : []);
  const candidates = (input.members ?? []).filter((m) => teamMemberIds.size === 0 || teamMemberIds.has(m.id));
  return candidates.sort((a, b) => (a.activeTasks ?? 0) - (b.activeTasks ?? 0))[0]?.id;
}

function validAssignee(value: unknown, input: TaskSuggestionInput): string | undefined {
  if (typeof value !== 'string') return undefined;
  return input.members?.some((m) => m.id === value) ? value : undefined;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function optionalString(value: unknown, fallback?: string): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim().slice(0, 1500);
  return fallback;
}

function toTitle(instruction: string): string {
  const cleaned = instruction.replace(/[.。]+$/g, '').trim();
  if (cleaned.length <= 90) return capitalize(cleaned);
  return `${capitalize(cleaned.slice(0, 87).trim())}...`;
}

function capitalize(value: string): string {
  return value.length === 0 ? 'Nueva tarea' : value[0]!.toUpperCase() + value.slice(1);
}
