import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPersonalAccountAiProvider,
  embedPersonalAccountTexts,
  isPersonalAccountAiEmailAllowed,
  isPersonalAccountAiEnabled,
  personalAccountAiModel,
  personalAccountAiEmbeddingModel,
} from './personal-account-ai';

const original = {
  enabled: process.env.PULSO_PERSONAL_ACCOUNT_AI_ENABLED,
  allowed: process.env.PULSO_PERSONAL_ACCOUNT_AI_ALLOWED_EMAILS,
  key: process.env.PULSO_PERSONAL_ACCOUNT_AI_GEMINI_API_KEY,
  model: process.env.PULSO_PERSONAL_ACCOUNT_AI_MODEL,
  termsAck: process.env.PULSO_PERSONAL_ACCOUNT_AI_DATA_TERMS_ACK,
  embeddingModel: process.env.PULSO_PERSONAL_ACCOUNT_AI_EMBEDDING_MODEL,
};

afterEach(() => {
  vi.unstubAllGlobals();
  restore('PULSO_PERSONAL_ACCOUNT_AI_ENABLED', original.enabled);
  restore('PULSO_PERSONAL_ACCOUNT_AI_ALLOWED_EMAILS', original.allowed);
  restore('PULSO_PERSONAL_ACCOUNT_AI_GEMINI_API_KEY', original.key);
  restore('PULSO_PERSONAL_ACCOUNT_AI_MODEL', original.model);
  restore('PULSO_PERSONAL_ACCOUNT_AI_DATA_TERMS_ACK', original.termsAck);
  restore('PULSO_PERSONAL_ACCOUNT_AI_EMBEDDING_MODEL', original.embeddingModel);
});

describe('Personal Account AI configuration', () => {
  it('falla cerrado y exige coincidencia exacta de email normalizado', () => {
    delete process.env.PULSO_PERSONAL_ACCOUNT_AI_ENABLED;
    process.env.PULSO_PERSONAL_ACCOUNT_AI_ALLOWED_EMAILS = ' Tester@Example.com,other@example.com ';
    expect(isPersonalAccountAiEnabled()).toBe(false);
    expect(isPersonalAccountAiEmailAllowed('tester@example.com')).toBe(true);
    expect(isPersonalAccountAiEmailAllowed('tester@example.com.attacker')).toBe(false);
  });

  it('fija un modelo estable salvo override explícito', () => {
    delete process.env.PULSO_PERSONAL_ACCOUNT_AI_MODEL;
    expect(personalAccountAiModel()).toBe('gemini-3.1-flash-lite');
    process.env.PULSO_PERSONAL_ACCOUNT_AI_MODEL = 'gemini-controlled';
    expect(personalAccountAiModel()).toBe('gemini-controlled');
  });

  it('rechaza la key si no existe confirmación explícita de Paid Services', () => {
    process.env.PULSO_PERSONAL_ACCOUNT_AI_GEMINI_API_KEY = 'synthetic-gemini-key';
    delete process.env.PULSO_PERSONAL_ACCOUNT_AI_DATA_TERMS_ACK;
    expect(() => createPersonalAccountAiProvider()).toThrow(/Paid Services/);
  });

  it('fuerza el host oficial y conserva la API key fuera del resultado', async () => {
    process.env.PULSO_PERSONAL_ACCOUNT_AI_GEMINI_API_KEY = 'synthetic-gemini-key';
    process.env.PULSO_PERSONAL_ACCOUNT_AI_DATA_TERMS_ACK = 'paid-service-no-training';
    process.env.PULSO_PERSONAL_ACCOUNT_AI_MODEL = 'gemini-controlled';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: 'gemini-controlled',
      choices: [{ message: { content: '{"type":"NOTE","title":"T","content":"C"}' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createPersonalAccountAiProvider().complete({ messages: [{ role: 'user', content: 'hola' }] });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(init.headers).toMatchObject({ authorization: 'Bearer synthetic-gemini-key' });
    expect(JSON.stringify(result)).not.toContain('synthetic-gemini-key');
  });

  it('usa batchEmbedContents nativo con tareas de retrieval y host fijo', async () => {
    process.env.PULSO_PERSONAL_ACCOUNT_AI_GEMINI_API_KEY = 'synthetic-gemini-key';
    process.env.PULSO_PERSONAL_ACCOUNT_AI_DATA_TERMS_ACK = 'paid-service-no-training';
    delete process.env.PULSO_PERSONAL_ACCOUNT_AI_EMBEDDING_MODEL;
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ embeddings: [{ values: [0.1, 0.2] }] }));
    await expect(embedPersonalAccountTexts(['documento'], 'RETRIEVAL_DOCUMENT', fetchMock)).resolves.toEqual([[0.1, 0.2]]);
    expect(personalAccountAiEmbeddingModel()).toBe('gemini-embedding-001');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents');
    expect(init.headers).toMatchObject({ 'x-goog-api-key': 'synthetic-gemini-key' });
    expect(JSON.parse(String(init.body))).toMatchObject({
      requests: [{ model: 'models/gemini-embedding-001', taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: 768 }],
    });
  });
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
