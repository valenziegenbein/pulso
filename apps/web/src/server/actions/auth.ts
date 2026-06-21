'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma, verifyPassword } from '@pulso/database';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/constants';
import { createSessionToken } from '@/lib/auth/session';
import type { LoginState } from '@/server/action-types';

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Completá email y contraseña.' };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: 'Credenciales inválidas.' };
  }

  const membership = await prisma.orgMembership.findFirst({ where: { userId: user.id } });
  if (!membership) return { error: 'El usuario no pertenece a ninguna organización.' };

  (await cookies()).set(SESSION_COOKIE, createSessionToken(user.id), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
