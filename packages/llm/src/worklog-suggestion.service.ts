import { WORKLOG_TYPE, type WorklogType } from '@pulso/shared';
import type { ChatContentPart, LLMProvider } from './provider';

export interface TaskContext {
  title?: string;
  description?: string;
  status?: string;
  teamName?: string;
}

export interface SuggestionInput {
  /** Micro-nota del usuario. Ej: "investigando intercom". */
  note: string;
  task?: TaskContext;
  attachmentsHint?: string[];
  /** Imagenes/capturas adjuntas manualmente para contexto visual del borrador. */
  images?: SuggestionImage[];
  locale?: string;
}

export interface SuggestionImage {
  dataUrl: string;
  mediaType?: string;
  detail?: 'auto' | 'low' | 'high';
}

export interface WorklogSuggestion {
  type: WorklogType;
  title: string;
  content: string;
}

const SYSTEM_PROMPT = `Sos un asistente que ayuda a una persona a registrar su trabajo en una bitácora interna.

Convertí la micro-nota del usuario en una entrada de bitácora clara y útil.

Reglas estrictas:
- Escribí en primera persona, en español neutro, claro y conciso (2-4 oraciones).
- NUNCA inventes datos, herramientas, resultados ni personas que no estén en la nota o el contexto. Si falta información, mantené la entrada general.
- Esto NO es vigilancia: describí el trabajo y su intención, nunca el comportamiento de la persona.
- Proponé el tipo de entrada más adecuado entre: ${WORKLOG_TYPE.join(', ')}.
- Cuando tenga sentido, mencioná el resultado esperado.

Respondé EXCLUSIVAMENTE con un objeto JSON válido, sin texto adicional, con esta forma:
{"type": "<TIPO>", "title": "<título corto>", "content": "<entrada de bitácora>"}`;

/**
 * Traduce micro-notas en entradas de bitácora usando un LLMProvider.
 *
 * IMPORTANTE: este servicio NUNCA persiste ni publica. Devuelve una sugerencia
 * que el caller mostrará como BORRADOR. Aceptar, editar, descartar o publicar
 * son acciones humanas en casos de uso separados.
 */
export class WorklogSuggestionService {
  constructor(private readonly provider: LLMProvider) {}

  async suggest(input: SuggestionInput): Promise<WorklogSuggestion> {
    const { text } = await this.provider.complete({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserContent(input) },
      ],
      temperature: 0.3,
      maxTokens: 600,
    });
    return parseSuggestion(text, input);
  }
}

function buildUserContent(input: SuggestionInput): string | ChatContentPart[] {
  const prompt = buildUserPrompt(input);
  const images = input.images?.filter((image) => image.dataUrl.trim().length > 0).slice(0, 3) ?? [];
  if (images.length === 0) return prompt;

  return [
    {
      type: 'text',
      text: `${prompt}\n\nSi hay imagen adjunta, usala solo como contexto visual voluntario. No inventes datos que no esten claros en la nota o la imagen.`,
    },
    ...images.map((image) => ({
      type: 'image' as const,
      dataUrl: image.dataUrl,
      mediaType: image.mediaType,
      detail: image.detail ?? 'auto',
    })),
  ];
}

function buildUserPrompt(input: SuggestionInput): string {
  const lines = [`Nota: "${input.note}"`];
  if (input.task) {
    const t = input.task;
    if (t.title) lines.push(`Tarea activa: ${t.title}`);
    if (t.status) lines.push(`Estado: ${t.status}`);
    if (t.teamName) lines.push(`Equipo: ${t.teamName}`);
    if (t.description) lines.push(`Descripción de la tarea: ${t.description}`);
  }
  if (input.attachmentsHint?.length) {
    lines.push(`Adjuntos/links de referencia: ${input.attachmentsHint.join(', ')}`);
  }
  if (input.images?.length) {
    lines.push(`Imagenes adjuntas: ${input.images.length} captura(s) manual(es) para contexto visual`);
  }
  return lines.join('\n');
}

const VALID_TYPES = new Set<string>(WORKLOG_TYPE);

/** Parser tolerante: si el modelo no devuelve JSON limpio, degrada con seguridad. */
function parseSuggestion(text: string, input: SuggestionInput): WorklogSuggestion {
  const fallback: WorklogSuggestion = {
    type: 'NOTE',
    title: input.note.slice(0, 80),
    content: text.trim() || input.note,
  };

  const raw = text.match(/\{[\s\S]*\}/)?.[0];
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Partial<WorklogSuggestion>;
    const type = typeof parsed.type === 'string' && VALID_TYPES.has(parsed.type)
      ? (parsed.type as WorklogType)
      : 'NOTE';
    return {
      type,
      title: (parsed.title ?? input.note).toString().slice(0, 200),
      content: (parsed.content ?? text).toString().slice(0, 5000),
    };
  } catch {
    return fallback;
  }
}
