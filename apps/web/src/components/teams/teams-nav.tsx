'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Navegación lateral de Teams con resaltado del link activo. */
export function TeamsNav({ items }: { items: Array<{ href: string; label: string }> }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map(({ href, label }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
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
  );
}
