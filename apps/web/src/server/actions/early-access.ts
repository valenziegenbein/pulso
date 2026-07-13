'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireSuperAdmin } from '@/lib/auth/context';
import type { AuthFlowState } from '@/server/action-types';
import {
  approveEarlyAccessRequest,
  claimEarlyAccessRequest,
  rejectEarlyAccessRequest,
  revokeEarlyAccessRequest,
} from '@/server/early-access';

function value(formData: FormData, key: string, max = 500): string {
  const raw = formData.get(key);
  return typeof raw === 'string' ? raw.trim().slice(0, max) : '';
}

export async function approveEarlyAccessAction(formData: FormData): Promise<void> {
  const ctx = await requireSuperAdmin();
  await approveEarlyAccessRequest(value(formData, 'requestId', 80), ctx.user.id, value(formData, 'note'));
  revalidatePath('/internal/early-access');
}

export async function rejectEarlyAccessAction(formData: FormData): Promise<void> {
  const ctx = await requireSuperAdmin();
  await rejectEarlyAccessRequest(value(formData, 'requestId', 80), ctx.user.id, value(formData, 'note'));
  revalidatePath('/internal/early-access');
}

export async function revokeEarlyAccessAction(formData: FormData): Promise<void> {
  const ctx = await requireSuperAdmin();
  await revokeEarlyAccessRequest(value(formData, 'requestId', 80), ctx.user.id, value(formData, 'note'));
  revalidatePath('/internal/early-access');
}

export async function claimEarlyAccessAction(_previous: AuthFlowState, formData: FormData): Promise<AuthFlowState> {
  const token = value(formData, 'token', 256);
  const name = value(formData, 'name', 120);
  const password = String(formData.get('password') ?? '');
  const confirmation = String(formData.get('confirmation') ?? '');
  if (password !== confirmation) return { status: 'error', error: 'Las contraseñas no coinciden.' };
  if (password.length < 12 || password.length > 256) {
    return { status: 'error', error: 'La contraseña debe tener entre 12 y 256 caracteres.' };
  }
  const claimed = await claimEarlyAccessRequest(token, name, password);
  if (!claimed) return { status: 'error', error: 'El enlace no es válido, venció o la cuenta ya existe.' };
  redirect('/login?earlyAccess=ready');
}
