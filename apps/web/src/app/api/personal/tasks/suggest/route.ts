import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createLLMProvider, fallbackTaskSuggestion, TaskSuggestionService, type TaskSuggestionInput } from '@pulso/llm';
import { LocalUrlError, resolveProvider } from '@/lib/personal/resolve-provider';
import { rateLimit } from '@/lib/rate-limit';

const LIMIT = Number(process.env.WORKLOG_RATE_LIMIT ?? 20);
const WINDOW_MS = Number(process.env.WORKLOG_RATE_WINDOW_MS ?? 60_000);

interface Body {
  instruction?: unknown;
  project?: { name?: unknown; context?: unknown };
  activeTasks?: unknown;
  provider?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  apiKey?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const limit = rateLimit('personal-task-suggest', { limit: LIMIT, windowMs: WINDOW_MS });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(Math.ceil((limit.retryAfterMs ?? 0) / 1000)) } },
    );
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const instruction = typeof body?.instruction === 'string' ? body.instruction.trim() : '';
  const projectName = typeof body?.project?.name === 'string' ? body.project.name.trim() : '';
  const projectContext = typeof body?.project?.context === 'string' ? body.project.context.slice(0, 4000) : undefined;
  const model = typeof body?.model === 'string' ? body.model.trim() : '';
  const providerName = typeof body?.provider === 'string' ? body.provider : '';
  const rawUrl = typeof body?.baseUrl === 'string' ? body.baseUrl : '';
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey : '';
  if (instruction.length < 3 || instruction.length > 1000 || !projectName || !model) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const activeTasks = Array.isArray(body?.activeTasks)
    ? body.activeTasks
        .filter((task): task is { title: string; priority?: string } => (
          typeof task === 'object' && task !== null && 'title' in task && typeof task.title === 'string'
        ))
        .slice(0, 12)
        .map((task) => ({ title: task.title.slice(0, 200), priority: task.priority, status: 'TODO' }))
    : [];
  const input: TaskSuggestionInput = {
    instruction,
    organizationName: 'Pulso Personal',
    team: { id: 'personal', name: projectName, description: projectContext },
    activeTasks,
  };

  let provider;
  try {
    provider = createLLMProvider(resolveProvider(providerName, rawUrl, model, apiKey, 30_000));
  } catch (error) {
    return NextResponse.json({ error: error instanceof LocalUrlError ? error.code : 'bad_url' }, { status: 400 });
  }

  let task;
  try {
    task = await new TaskSuggestionService(provider).suggest(input);
  } catch {
    task = fallbackTaskSuggestion(input);
  }
  const parts = [task.description];
  if (task.expectedOutcome) parts.push(`Resultado esperado: ${task.expectedOutcome}`);
  if (task.definitionOfDone) parts.push(`Terminado cuando: ${task.definitionOfDone}`);

  return NextResponse.json({
    suggestion: {
      type: 'TASK',
      title: task.title,
      content: parts.join('\n\n'),
      priority: task.suggestedPriority === 'HIGH' ? 'high' : task.suggestedPriority === 'LOW' ? 'low' : 'medium',
    },
  });
}
