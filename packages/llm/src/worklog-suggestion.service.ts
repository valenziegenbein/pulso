import { WORKLOG_TYPE, type WorklogType } from '@pulso/shared';
import type { ChatContentPart, CompletionRequest, LLMProvider } from './provider';

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
  /** Contexto del proyecto en foco (modo personal). Se recorta a un presupuesto. */
  projectContext?: string;
  attachmentsHint?: string[];
  /** Imagenes/capturas adjuntas manualmente para contexto visual del borrador. */
  images?: SuggestionImage[];
  locale?: string;
}

// Presupuesto de contexto (en caracteres ≈ 4 por token). Mantiene el prompt
// dentro de la ventana del modelo aunque el proyecto o la nota crezcan.
const BUDGET = {
  note: 2000,
  projectContext: 1200,
  taskDescription: 800,
} as const;

function clamp(text: string, maxChars: number): string {
  const t = text.trim();
  return t.length <= maxChars ? t : `${t.slice(0, maxChars - 1).trimEnd()}…`;
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
    try {
      return await this.run(input);
    } catch (err) {
      // Degradación: si había imagen y la generación falló (modelo sin visión,
      // payload muy grande, contexto excedido), reintentamos solo con texto.
      // Preferimos un borrador útil a romper el flujo. Sin nota no hay retry:
      // el modelo no tendría nada que convertir.
      if (input.images?.length && input.note.trim().length > 0) {
        return this.run({ ...input, images: undefined });
      }
      throw err;
    }
  }

  /**
   * Variante con streaming: `onContentDelta` recibe el texto de la bitácora a
   * medida que el modelo lo escribe (solo el campo "content" del JSON), para
   * que la UI muestre el borrador en vivo. Resuelve con la sugerencia completa.
   * Si el provider no soporta streaming o falla, degrada a `suggest()`.
   */
  async suggestStream(input: SuggestionInput, onContentDelta: (text: string) => void): Promise<WorklogSuggestion> {
    if (!this.provider.completeStream) return this.suggest(input);
    try {
      const extractor = new ContentFieldExtractor();
      const { text } = await this.provider.completeStream(this.buildRequest(input), (chunk) =>
        extractor.feed(chunk, onContentDelta),
      );
      return parseSuggestion(text, input);
    } catch {
      // Sin stream (incluye el retry sin imagen de suggest()).
      return this.suggest(input);
    }
  }

  private async run(input: SuggestionInput): Promise<WorklogSuggestion> {
    const { text } = await this.provider.complete(this.buildRequest(input));
    return parseSuggestion(text, input);
  }

  private buildRequest(input: SuggestionInput): CompletionRequest {
    return {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserContent(input) },
      ],
      temperature: 0.3,
      // Generoso: los modelos de razonamiento (gemma-4, etc.) gastan tokens
      // "pensando" antes del JSON; con poco presupuesto la salida se trunca y el
      // JSON queda incompleto → caería al fallback. Es un máximo, no un forzado.
      maxTokens: 1000,
    };
  }
}

/**
 * Extrae incrementalmente el VALOR del campo `"content"` del JSON que el modelo
 * va emitiendo, des-escapando la string JSON sobre la marcha. Permite mostrar
 * la entrada de bitácora en vivo sin esperar el JSON completo (y sin exponer
 * llaves/comillas crudas en la UI).
 */
class ContentFieldExtractor {
  private buf = '';
  private state: 'searching' | 'inString' | 'done' = 'searching';
  private escape = false;
  private unicode = '';

  feed(chunk: string, emit: (text: string) => void): void {
    if (this.state === 'done') return;
    if (this.state === 'searching') {
      this.buf += chunk;
      const m = this.buf.match(/"content"\s*:\s*"/);
      if (!m) {
        // Mantiene el buffer acotado; el patrón es corto, con la cola alcanza.
        if (this.buf.length > 8000) this.buf = this.buf.slice(-100);
        return;
      }
      const rest = this.buf.slice((m.index ?? 0) + m[0].length);
      this.buf = '';
      this.state = 'inString';
      this.consume(rest, emit);
      return;
    }
    this.consume(chunk, emit);
  }

  private consume(text: string, emit: (t: string) => void): void {
    let out = '';
    for (const ch of text) {
      if (this.unicode.length > 0) {
        this.unicode += ch;
        if (this.unicode.length === 5) {
          const code = Number.parseInt(this.unicode.slice(1), 16);
          if (!Number.isNaN(code)) out += String.fromCharCode(code);
          this.unicode = '';
        }
        continue;
      }
      if (this.escape) {
        this.escape = false;
        if (ch === 'n') out += '\n';
        else if (ch === 't') out += '\t';
        else if (ch === 'r') out += '\r';
        else if (ch === 'u') this.unicode = 'u';
        else out += ch; // \" \\ \/ y desconocidos → literal
        continue;
      }
      if (ch === '\\') {
        this.escape = true;
        continue;
      }
      if (ch === '"') {
        this.state = 'done';
        break;
      }
      out += ch;
    }
    if (out) emit(out);
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
  const note = input.note.trim();
  // Captura sola (sin nota): la entrada se arma desde la imagen. Sin inventar.
  const lines = [
    note.length > 0
      ? `Nota: "${clamp(note, BUDGET.note)}"`
      : 'Nota: (la persona no escribió nota; describí el trabajo visible en la captura adjunta, de forma general y sin inventar detalles)',
  ];
  if (input.task) {
    const t = input.task;
    if (t.title) lines.push(`Tarea activa: ${t.title}`);
    if (t.status) lines.push(`Estado: ${t.status}`);
    if (t.teamName) lines.push(`Equipo: ${t.teamName}`);
    if (t.description) lines.push(`Descripción de la tarea: ${clamp(t.description, BUDGET.taskDescription)}`);
  }
  if (input.projectContext) {
    lines.push(`Contexto del proyecto: ${clamp(input.projectContext, BUDGET.projectContext)}`);
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
  const noteFallback = input.note.trim() || 'Captura de pantalla';
  const fallback: WorklogSuggestion = {
    type: 'NOTE',
    title: noteFallback.slice(0, 80),
    content: text.trim() || noteFallback,
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
      title: (parsed.title ?? noteFallback).toString().slice(0, 200),
      content: (parsed.content ?? text).toString().slice(0, 5000),
    };
  } catch {
    return fallback;
  }
}
