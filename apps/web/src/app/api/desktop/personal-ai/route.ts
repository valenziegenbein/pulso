import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  fallbackTaskSuggestion,
  LLMRequestError,
  TaskSuggestionService,
  WorklogSuggestionService,
  type TaskSuggestionInput,
} from '@pulso/llm';
import { rateLimit } from '@/lib/rate-limit';
import { PayloadTooLargeError, readJsonBody } from '@/server/http';
import {
  createPersonalAccountAiProvider,
  embedPersonalAccountTexts,
  getPersonalAccountAiAccess,
  isPersonalAccountAiEnabled,
  personalAccountAiEmbeddingModel,
} from '@/server/personal-account-ai';

const MAX_BODY_BYTES = 7_000_000;
const MAX_IMAGES = 3;
const MAX_IMAGE_CHARS = 2_000_000;
const IMAGE_DATA_URL = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z0-9+/=\r\n]+)$/i;

interface Body {
  operation?: unknown;
  note?: unknown;
  task?: { title?: unknown };
  projectContext?: unknown;
  notesContext?: unknown;
  attachmentsHint?: unknown;
  images?: unknown;
  instruction?: unknown;
  project?: { name?: unknown; context?: unknown };
  activeTasks?: unknown;
  texts?: unknown;
  taskType?: unknown;
}

interface SuggestImage {
  dataUrl: string;
  mediaType: string;
}

export async function GET(): Promise<NextResponse> {
  if (!isPersonalAccountAiEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const access = await getPersonalAccountAiAccess();
  return NextResponse.json({
    authenticated: access.authenticated,
    enabled: access.enabled,
    reason: access.enabled ? undefined : access.reason,
    model: access.enabled ? access.model : undefined,
    embeddingsModel: access.enabled ? personalAccountAiEmbeddingModel() : undefined,
  }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!isPersonalAccountAiEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const access = await getPersonalAccountAiAccess();
  if (!access.authenticated) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  if (!access.enabled) return NextResponse.json({ error: access.reason }, { status: access.reason === 'not_allowlisted' ? 403 : 503 });

  const limit = rateLimit(`personal-account-ai:${access.userId}`, {
    limit: Number(process.env.PULSO_PERSONAL_ACCOUNT_AI_RATE_LIMIT ?? 20),
    windowMs: Number(process.env.PULSO_PERSONAL_ACCOUNT_AI_RATE_WINDOW_MS ?? 60_000),
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(Math.ceil((limit.retryAfterMs ?? 0) / 1000)) } },
    );
  }

  let body: Body | null;
  try {
    body = (await readJsonBody(req, MAX_BODY_BYTES)) as Body | null;
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    throw error;
  }
  if (!body) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  try {
    if (body.operation === 'draft') return await suggestDraft(body);
    if (body.operation === 'task') return await suggestTask(body);
    if (body.operation === 'embed') return await embed(body);
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  } catch (error) {
    if (error instanceof InvalidInputError) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    if (error instanceof LLMRequestError && error.status === 429) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
    return NextResponse.json({ error: 'llm_unavailable' }, { status: 502 });
  }
}

async function embed(body: Body): Promise<NextResponse> {
  const texts = Array.isArray(body.texts)
    ? body.texts.filter((value): value is string => typeof value === 'string')
    : [];
  const taskType = body.taskType === 'RETRIEVAL_QUERY' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';
  if (texts.length === 0 || texts.length > 32 || texts.some((text) => !text.trim() || text.length > 4_000)) {
    throw new InvalidInputError();
  }
  const vectors = await embedPersonalAccountTexts(texts, taskType);
  return NextResponse.json({ vectors, model: personalAccountAiEmbeddingModel() });
}

async function suggestDraft(body: Body): Promise<NextResponse> {
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const images = parseImages(body.images);
  if ((!note && images.length === 0) || note.length > 500) throw new InvalidInputError();
  const suggestion = await new WorklogSuggestionService(createPersonalAccountAiProvider()).suggest({
    note,
    task: typeof body.task?.title === 'string' ? { title: body.task.title.slice(0, 200) } : undefined,
    projectContext: typeof body.projectContext === 'string' ? body.projectContext.slice(0, 4000) : undefined,
    notesContext: typeof body.notesContext === 'string' ? body.notesContext.slice(0, 8000) : undefined,
    attachmentsHint: Array.isArray(body.attachmentsHint)
      ? body.attachmentsHint.filter((item): item is string => typeof item === 'string').slice(0, 5)
      : undefined,
    images: images.length ? images : undefined,
  });
  return NextResponse.json({ status: 'DRAFT', suggestion, requestId: randomUUID() });
}

async function suggestTask(body: Body): Promise<NextResponse> {
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
  const projectName = typeof body.project?.name === 'string' ? body.project.name.trim() : '';
  if (instruction.length < 3 || instruction.length > 1000 || !projectName) throw new InvalidInputError();
  const input: TaskSuggestionInput = {
    instruction,
    organizationName: 'Pulso Personal',
    team: {
      id: 'personal',
      name: projectName.slice(0, 200),
      description: typeof body.project?.context === 'string' ? body.project.context.slice(0, 4000) : undefined,
    },
    activeTasks: Array.isArray(body.activeTasks)
      ? body.activeTasks
          .filter((task): task is { title: string; priority?: string } => (
            typeof task === 'object' && task !== null && 'title' in task && typeof task.title === 'string'
          ))
          .slice(0, 12)
          .map((task) => ({ title: task.title.slice(0, 200), priority: task.priority, status: 'TODO' }))
      : [],
  };
  let task;
  try {
    task = await new TaskSuggestionService(createPersonalAccountAiProvider()).suggest(input);
  } catch (error) {
    if (error instanceof LLMRequestError && error.status === 429) throw error;
    task = fallbackTaskSuggestion(input);
  }
  const content = [task.description];
  if (task.expectedOutcome) content.push(`Resultado esperado: ${task.expectedOutcome}`);
  if (task.definitionOfDone) content.push(`Terminado cuando: ${task.definitionOfDone}`);
  return NextResponse.json({
    suggestion: {
      type: 'TASK',
      title: task.title,
      content: content.join('\n\n'),
      priority: task.suggestedPriority === 'HIGH' ? 'high' : task.suggestedPriority === 'LOW' ? 'low' : 'medium',
    },
    requestId: randomUUID(),
  });
}

function parseImages(input: unknown): SuggestImage[] {
  const values = Array.isArray(input) ? input : input ? [input] : [];
  if (values.length > MAX_IMAGES) throw new InvalidInputError();
  return values.map((value) => {
    const dataUrl = typeof value === 'string'
      ? value
      : typeof value === 'object' && value !== null && 'dataUrl' in value && typeof value.dataUrl === 'string'
        ? value.dataUrl
        : '';
    if (!dataUrl || dataUrl.length > MAX_IMAGE_CHARS) throw new InvalidInputError();
    const match = dataUrl.match(IMAGE_DATA_URL);
    if (!match?.[1]) throw new InvalidInputError();
    return { dataUrl, mediaType: match[1].toLowerCase().replace('image/jpg', 'image/jpeg') };
  });
}

class InvalidInputError extends Error {}
