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
import { createSafeLlmFetch, resolveProviderBaseUrl } from '@/server/llm-url-policy';

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
    const providerType = row.providerType as LLMProviderType;
    const config: LLMProviderResolved = {
      type: providerType,
      baseUrl: await resolveProviderBaseUrl(providerType, row.baseUrl),
      model: row.model,
      apiKey: row.apiKeyEncrypted ? decryptSecret(row.apiKeyEncrypted) : undefined,
      fetchImpl: createSafeLlmFetch(timeoutMs),
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
