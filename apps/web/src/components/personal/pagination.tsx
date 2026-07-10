'use client';

/**
 * Paginación numerada (como la de un buscador): números de página con ventana
 * deslizante alrededor de la página activa, más flechas de anterior/siguiente.
 * `variant="compact"` omite inicio/final (para vivir junto al buscador, arriba);
 * `variant="expanded"` los incluye (para el pie de la lista).
 */
export function Pagination({
  page,
  pageCount,
  onChange,
  variant = 'expanded',
}: {
  /** 0-indexada. */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  variant?: 'compact' | 'expanded';
}) {
  if (pageCount <= 1) return null;

  const windowSize = variant === 'compact' ? 5 : 9;
  let start = Math.max(0, Math.min(page - Math.floor(windowSize / 2), pageCount - windowSize));
  start = Math.max(0, start);
  const end = Math.min(pageCount - 1, start + windowSize - 1);
  const nums: number[] = [];
  for (let i = start; i <= end; i++) nums.push(i);

  return (
    <nav className="flex items-center gap-1 font-meta text-xs" aria-label="Paginación">
      {variant === 'expanded' && (
        <ArrowButton onClick={() => onChange(0)} disabled={page === 0} label="Ir al inicio">
          «
        </ArrowButton>
      )}
      <ArrowButton onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0} label="Página anterior">
        ‹
      </ArrowButton>

      {start > 0 && <Ellipsis />}
      {nums.map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          aria-current={n === page ? 'page' : undefined}
          className={`flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg px-1.5 transition ${
            n === page ? 'bg-accent font-medium text-bg' : 'text-muted hover:bg-surface hover:text-fg'
          }`}
        >
          {n + 1}
        </button>
      ))}
      {end < pageCount - 1 && <Ellipsis />}

      <ArrowButton onClick={() => onChange(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1} label="Página siguiente">
        ›
      </ArrowButton>
      {variant === 'expanded' && (
        <ArrowButton onClick={() => onChange(pageCount - 1)} disabled={page >= pageCount - 1} label="Ir al final">
          »
        </ArrowButton>
      )}
    </nav>
  );
}

function Ellipsis() {
  return <span className="px-1 text-muted">…</span>;
}

function ArrowButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-fg disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
