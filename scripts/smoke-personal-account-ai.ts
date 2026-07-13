import { createPersonalAccountAiProvider } from '../apps/web/src/server/personal-account-ai';

const ACK = 'one-managed-generation';

async function main(): Promise<void> {
  if (process.env.PULSO_PERSONAL_ACCOUNT_AI_SMOKE_ACK !== ACK) {
    throw new Error(`Smoke bloqueado: PULSO_PERSONAL_ACCOUNT_AI_SMOKE_ACK debe ser ${ACK}.`);
  }
  const started = Date.now();
  const result = await createPersonalAccountAiProvider().complete({
    messages: [{ role: 'user', content: 'Respondé únicamente con la palabra OK.' }],
    maxTokens: 16,
    temperature: 0,
  });
  console.log(JSON.stringify({
    event: 'personal_account_ai_smoke',
    model: result.model,
    nonEmpty: result.text.trim().length > 0,
    latencyMs: Date.now() - started,
  }));
}

void main().catch((error: unknown) => {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  console.error(JSON.stringify({
    event: 'personal_account_ai_smoke_failed',
    name: error instanceof Error ? error.name : 'Error',
    status: typeof record.status === 'number' ? record.status : undefined,
  }));
  process.exitCode = 1;
});
