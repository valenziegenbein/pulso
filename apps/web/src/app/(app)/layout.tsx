import Link from 'next/link';
import type { ReactNode } from 'react';
import { PERMISSIONS } from '@pulso/domain';
import { hasPermission, requireAuth } from '@/lib/auth/context';
import { logoutAction } from '@/server/actions/auth';
import { AuthBridge } from '@/components/auth-bridge';
import { VersionTag } from '@/components/version-tag';

const NAV: Array<[string, string, 'all' | 'admin']> = [
  ['/', 'Resumen', 'all'],
  ['/tasks', 'Tareas', 'all'],
  ['/teams', 'Equipos', 'all'],
  ['/members', 'Miembros', 'admin'],
  ['/admin', 'Admin', 'admin'],
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireAuth();

  return (
    <div className="flex min-h-screen">
      <AuthBridge />
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface p-4">
        <div className="mb-6 text-lg font-semibold">
          <span className="text-accent">✦</span> Pulso
        </div>
        <nav className="flex flex-1 flex-col gap-1 text-sm">
          {NAV.filter(([, , scope]) => scope === 'all' || hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW_ADMIN)).map(([href, label]) => (
            <Link key={href} href={href} className="rounded-lg px-3 py-2 text-muted hover:bg-bg hover:text-fg">
              {label}
            </Link>
          ))}
          <Link href="/personal" className="mt-4 rounded-lg px-3 py-2 text-muted hover:bg-bg hover:text-fg">
            Modo personal
          </Link>
        </nav>
        <div className="border-t border-border pt-3 text-xs">
          <div className="font-medium">{ctx.user.name}</div>
          <div className="text-muted">{ctx.role}</div>
          <form action={logoutAction} className="mt-2">
            <button className="text-muted hover:text-fg">Salir</button>
          </form>
          <VersionTag className="mt-2 block text-[10px] text-muted/60" />
        </div>
      </aside>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
