import type { ReactNode } from 'react';
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import { PERMISSIONS } from '@pulso/domain';
import { hasPermission, requireAuth } from '@/lib/auth/context';
import { logoutAction } from '@/server/actions/auth';
import { AuthBridge } from '@/components/auth-bridge';
import { VersionTag } from '@/components/version-tag';
import { TeamsNav } from '@/components/teams/teams-nav';

const display = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

const NAV: Array<[string, string, 'all' | 'admin']> = [
  ['/', 'Resumen', 'all'],
  ['/tasks', 'Tareas', 'all'],
  ['/teams', 'Equipos', 'all'],
  ['/members', 'Miembros', 'admin'],
  ['/admin', 'Admin', 'admin'],
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireAuth();
  const isAdmin = hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW_ADMIN);
  const items = NAV.filter(([, , scope]) => scope === 'all' || isAdmin).map(([href, label]) => ({ href, label }));
  const initials = ctx.user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className={`${display.variable} ${body.variable} ${mono.variable} theme-teams relative min-h-screen overflow-x-hidden`}>
      <div className="atelier-glow" aria-hidden />
      <div className="atelier-grain" aria-hidden />
      <div className="relative z-10 flex min-h-screen">
        <AuthBridge />
        <aside className="flex w-60 shrink-0 flex-col justify-between border-r border-border/70 px-4 py-6">
          <div>
            <div className="mb-1 flex items-center gap-2 px-2 text-base font-semibold">
              <span className="pulso-beat inline-block text-accent">*</span> Pulso
            </div>
            <p className="font-meta mb-7 px-2 text-[10px] uppercase tracking-[0.2em] text-muted">
              {ctx.organizationName}
            </p>

            <TeamsNav items={items} />
          </div>

          <div className="px-2">
            <div className="flex items-center gap-2.5 border-t border-border/60 pt-4">
              <span className="font-meta flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-[11px] text-accent">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{ctx.user.name}</div>
                <div className="font-meta text-[10px] uppercase tracking-[0.16em] text-muted">{ctx.role}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <form action={logoutAction}>
                <button className="text-xs text-muted transition hover:text-fg">Salir</button>
              </form>
              <VersionTag className="font-meta text-[10px] text-muted/50" />
            </div>
          </div>
        </aside>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
