import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPersonalAccountAiProvider,
  isPersonalAccountAiEmailAllowed,
  isPersonalAccountAiEnabled,
  personalAccountAiModel,
} from './personal-account-ai';

const original = {
  enabled: process.env.PULSO_PERSONAL_ACCOUNT_AI_ENABLED,
  allowed: process.env.PULSO_PERSONAL_ACCOUNT_AI_ALLOWED_EMAILS,
  key: process.env.PULSO_PERSONAL_ACCOUNT_AI_GEMINI_API_KEY,
  model: process.env.PULSO_PERSONAL_ACCOUNT_AI_MODEL,
  termsAck: process.env.PULSO_PERSONAL_ACCOUNT_AI_DATA_TERMS_ACK,
};

afterEach(() => {
  vi.unstubAllGlobals();
  restore('PULSO_PERSONAL_ACCOUNT_AI_ENABLED', original.enabled);
  restore('PULSO_PERSONAL_ACCOUNT_AI_ALLOWED_EMAILS', original.allowed);
  restore('PULSO_PERSONAL_ACCOUNT_AI_GEMINI_API_KEY', original.key);
  restore('PULSO_PERSONAL_ACCOUNT_AI_MODEL', original.model);
  restore('PULSO_PERSONAL_ACCOUNT_AI_DATA_TERMS_ACK', original.termsAck);
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
});

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
