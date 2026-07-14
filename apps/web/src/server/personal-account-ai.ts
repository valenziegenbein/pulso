import { prisma } from '@pulso/database';
import { createLLMProvider, LLMRequestError, type LLMProvider } from '@pulso/llm';
import { getSessionIdentity } from '@/lib/auth/context';
import { fetchWithTimeout } from '@/lib/personal/ai-endpoint';
import { hasApprovedPersonalAiAccess } from '@/server/early-access';

const GEMINI_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const GEMINI_NATIVE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
const PAID_DATA_TERMS_ACK = 'paid-service-no-training';

export type PersonalAccountAiAccess =
  | { authenticated: false; enabled: false; reason: 'authentication_required' }
  | { authenticated: true; enabled: false; reason: 'not_allowlisted' | 'provider_unavailable'; userId: string }
  | { authenticated: true; enabled: true; userId: string; model: string };

export function isPersonalAccountAiEnabled(): boolean {
  return process.env.PULSO_PERSONAL_ACCOUNT_AI_ENABLED === 'true';
}

export function personalAccountAiModel(): string {
  return process.env.PULSO_PERSONAL_ACCOUNT_AI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export function personalAccountAiEmbeddingModel(): string {
  const model = process.env.PULSO_PERSONAL_ACCOUNT_AI_EMBEDDING_MODEL?.trim() || DEFAULT_GEMINI_EMBEDDING_MODEL;
  if (!/^[a-z0-9._-]+$/i.test(model)) throw new Error('Modelo de embeddings administrado inválido.');
  return model;
}

export function hasPersonalAccountAiPaidDataTermsAck(): boolean {
  return process.env.PULSO_PERSONAL_ACCOUNT_AI_DATA_TERMS_ACK === PAID_DATA_TERMS_ACK;
}

export function isPersonalAccountAiEmailAllowed(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return (process.env.PULSO_PERSONAL_ACCOUNT_AI_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}

export async function getPersonalAccountAiAccess(): Promise<PersonalAccountAiAccess> {
  const session = await getSessionIdentity();
  if (!session) return { authenticated: false, enabled: false, reason: 'authentication_required' };

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, normalizedEmail: true, status: true },
  });
  if (!user || user.status !== 'ACTIVE') {
    return { authenticated: false, enabled: false, reason: 'authentication_required' };
  }
  const allowed = isPersonalAccountAiEmailAllowed(user.normalizedEmail)
    || await hasApprovedPersonalAiAccess(user.normalizedEmail);
  if (!allowed) {
    return { authenticated: true, enabled: false, reason: 'not_allowlisted', userId: user.id };
  }
  if (!process.env.PULSO_PERSONAL_ACCOUNT_AI_GEMINI_API_KEY?.trim() || !hasPersonalAccountAiPaidDataTermsAck()) {
    return { authenticated: true, enabled: false, reason: 'provider_unavailable', userId: user.id };
  }
  return { authenticated: true, enabled: true, userId: user.id, model: personalAccountAiModel() };
}

/** Proveedor administrado por Pulso. El cliente nunca decide host, modelo ni key. */
export function createPersonalAccountAiProvider(): LLMProvider {
  const apiKey = process.env.PULSO_PERSONAL_ACCOUNT_AI_GEMINI_API_KEY?.trim();
  if (!apiKey || !hasPersonalAccountAiPaidDataTermsAck()) throw new Error('Proveedor Personal AI no configurado para Paid Services.');
  return createLLMProvider({
    type: 'OPENAI_COMPATIBLE',
    baseUrl: GEMINI_OPENAI_BASE_URL,
    model: personalAccountAiModel(),
    apiKey,
    fetchImpl: fetchWithTimeout(30_000),
  });
}

export type ManagedEmbeddingTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

/** Embeddings administrados por Pulso mediante el endpoint nativo y tipado de
 * Gemini. La API key, el host y el modelo permanecen exclusivamente server-side. */
export async function embedPersonalAccountTexts(
  texts: string[],
  taskType: ManagedEmbeddingTask,
  fetchImpl: typeof fetch = fetchWithTimeout(30_000),
): Promise<number[][]> {
  const apiKey = process.env.PULSO_PERSONAL_ACCOUNT_AI_GEMINI_API_KEY?.trim();
  if (!apiKey || !hasPersonalAccountAiPaidDataTermsAck()) {
    throw new Error('Proveedor Personal AI no configurado para Paid Services.');
  }
  if (texts.length === 0 || texts.length > 32 || texts.some((text) => !text.trim() || text.length > 4_000)) {
    throw new Error('Entrada de embeddings inválida.');
  }
  const model = personalAccountAiEmbeddingModel();
  const modelPath = `models/${model}`;
  const response = await fetchImpl(`${GEMINI_NATIVE_BASE_URL}/${modelPath}:batchEmbedContents`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: modelPath,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: 768,
      })),
    }),
  });
  if (!response.ok) throw new LLMRequestError(`Gemini embeddings respondió ${response.status}`, response.status, 'gemini');
  const payload = await response.json() as { embeddings?: Array<{ values?: number[] }> };
  const vectors = payload.embeddings?.map((embedding) => embedding.values ?? []) ?? [];
  if (vectors.length !== texts.length || vectors.some((vector) => vector.length === 0 || vector.some((value) => !Number.isFinite(value)))) {
    throw new LLMRequestError('Gemini devolvió embeddings inválidos.', 502, 'gemini');
  }
  return vectors;
}
