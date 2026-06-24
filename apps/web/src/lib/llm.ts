// SERVER-ONLY. No importar desde componentes cliente: API keys y base URLs de
// organizacion viven solo en servidor.
import { decryptSecret, prisma } from '@pulso/database';
import {
  createLLMProvider,
  MockProvider,
  TaskSuggestionService,
  WorklogSuggestionService,
  type LLMProvider,
  type LLMProviderResolved,
} from '@pulso/llm';
import type { LLMProviderType } from '@pulso/shared';

function fetchWithTimeout(ms: number): typeof fetch {
  return async (input, init) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(input, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  };
}

export interface OrganizationLLM {
  provider: LLMProvider;
  source: 'db' | 'mock';
  config?: LLMProviderResolved;
}

export async function getOrganizationLLMProvider(
  organizationId: string,
  timeoutMs = 120_000,
): Promise<OrganizationLLM> {
  const row = await prisma.lLMProviderConfig.findFirst({
    where: { organizationId, isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (!row || row.providerType === 'MOCK') {
    return { provider: new MockProvider(), source: 'mock' };
  }

  try {
    const config: LLMProviderResolved = {
      type: row.providerType as LLMProviderType,
      baseUrl: row.baseUrl ?? undefined,
      model: row.model,
      apiKey: row.apiKeyEncrypted ? decryptSecret(row.apiKeyEncrypted) : undefined,
      fetchImpl: fetchWithTimeout(timeoutMs),
    };
    return { provider: createLLMProvider(config), source: 'db', config };
  } catch {
    return { provider: new MockProvider(), source: 'mock' };
  }
}

export async function getWorklogSuggestionService(organizationId: string): Promise<WorklogSuggestionService> {
  const { provider } = await getOrganizationLLMProvider(organizationId);
  return new WorklogSuggestionService(provider);
}

export async function getTaskSuggestionService(organizationId: string): Promise<TaskSuggestionService> {
  const { provider } = await getOrganizationLLMProvider(organizationId);
  return new TaskSuggestionService(provider);
}
