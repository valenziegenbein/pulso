import { prisma } from '@pulso/database';
import { createLLMProvider, type LLMProvider } from '@pulso/llm';
import { getSessionIdentity } from '@/lib/auth/context';
import { fetchWithTimeout } from '@/lib/personal/ai-endpoint';
import { hasApprovedPersonalAiAccess } from '@/server/early-access';

const GEMINI_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
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
