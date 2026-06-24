'use server';

import { revalidatePath } from 'next/cache';
import { encryptSecret, prisma } from '@pulso/database';
import { PERMISSIONS } from '@pulso/domain';
import { configureLLMSchema } from '@pulso/shared';
import { hasPermission, requireAuth } from '@/lib/auth/context';

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s : undefined;
}

export async function configureOrganizationLLMAction(formData: FormData): Promise<void> {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.LLM_CONFIGURE)) throw new Error('Sin permiso para configurar IA.');

  const providerType = str(formData, 'providerType') ?? 'MOCK';
  const existing = await prisma.lLMProviderConfig.findFirst({
    where: { organizationId: ctx.organizationId, isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
  const parsed = configureLLMSchema.parse({
    providerType,
    baseUrl: providerType === 'MOCK' ? undefined : str(formData, 'baseUrl'),
    model: providerType === 'MOCK' ? 'mock-1' : (str(formData, 'model') ?? 'mock-1'),
    apiKey: str(formData, 'apiKey'),
  });

  await prisma.lLMProviderConfig.updateMany({
    where: { organizationId: ctx.organizationId, isActive: true },
    data: { isActive: false },
  });
  await prisma.lLMProviderConfig.create({
    data: {
      organizationId: ctx.organizationId,
      providerType: parsed.providerType,
      baseUrl: parsed.providerType === 'MOCK' ? null : (parsed.baseUrl ?? null),
      model: parsed.model,
      apiKeyEncrypted: parsed.providerType === 'MOCK'
        ? null
        : parsed.apiKey
          ? encryptSecret(parsed.apiKey)
          : existing?.providerType === parsed.providerType
            ? existing.apiKeyEncrypted
            : null,
      isActive: true,
    },
  });

  revalidatePath('/admin');
  revalidatePath('/');
}
