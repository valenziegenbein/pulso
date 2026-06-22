'use client';

import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { usePersonal } from '@/lib/personal/store';

const NAV: Array<[string, string]> = [
  ['/personal', 'Inicio'],
  ['/personal/proyectos', 'Proyectos'],
  ['/personal/bitacora', 'Bitácora'],
  ['/personal/ajustes', 'Ajustes'],
];

export default function PersonalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, onboarded, name } = usePersonal();

  useEffect(() => {
    if (ready && !onboarded) router.replace('/welcome');
  }, [ready, onboarded, router]);

  if (ready && !onboarded) return null;

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-52 shrink-0 flex-col justify-between border-r border-border/70 px-4 py-6">
        <div>
          <div className="mb-8 flex items-center gap-2 px-2 text-base font-semibold">
            <span className="pulso-beat inline-block text-accent">✦</span> Pulso
          </div>
          <nav className="flex flex-col gap-0.5">
            {NAV.map(([href, label]) => {
              const active = href === '/personal' ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-lg px-3 py-2 text-sm transition ${
                    active ? 'bg-surface text-fg' : 'text-muted hover:bg-surface/60 hover:text-fg'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="px-2">
          <div className="text-sm font-medium">{name ?? 'Vos'}</div>
          <div className="font-meta text-[10px] uppercase tracking-[0.18em] text-muted">Modo personal</div>
        </div>
      </aside>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
