import type { ReactNode } from 'react';
import { PRIORITY_LABEL, STATUS_LABEL } from '@/lib/labels';

/**
 * Primitivas visuales del modo Teams. Mismo lenguaje "atelier" que el modo
 * personal (Fraunces display, JetBrains mono meta, paleta cálida, cards sobrias),
 * adaptado a la densidad de coordinación de equipo. Todo presentacional y
 * server-component-safe (sin hooks).
 */

// --- Estilos de formulario reutilizables ---------------------------------
// Fondo SÓLIDO + texto explícito a propósito: el modificador de opacidad
// (bg-bg/50) sobre una var CSS plana genera un valor inválido y el input cae al
// blanco por defecto del navegador → texto cream ilegible. Sólido lo evita.
export const inputCls =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent';
export const selectCls =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-fg outline-none transition focus:border-accent';
export const textareaCls =
  'w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm leading-relaxed text-fg outline-none transition placeholder:text-muted focus:border-accent';
export const btnPrimary =
  'rounded-full bg-accent px-5 py-2 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40';
export const btnGhost =
  'rounded-full border border-border px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-fg';

// --- Layout --------------------------------------------------------------
export function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {kicker && <p className="font-meta mb-2 text-[11px] uppercase tracking-[0.22em] text-accent">{kicker}</p>}
        <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-xl text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  children,
  className = '',
  title,
  action,
  id,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className={`rounded-2xl border border-border bg-surface/60 p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="font-meta text-[11px] uppercase tracking-[0.2em] text-muted">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone = 'fg' }: { label: string; value: number | string; tone?: BadgeTone }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-4">
      <div className="font-display text-3xl" style={{ color: TONE_VAR[tone] }}>
        {value}
      </div>
      <div className="font-meta mt-1 text-[10px] uppercase tracking-[0.16em] text-muted">{label}</div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border/70 p-5 text-center text-sm text-muted">{children}</p>;
}

// --- Badges semánticos ---------------------------------------------------
type BadgeTone = 'fg' | 'muted' | 'accent' | 'ok' | 'warn' | 'danger' | 'info';

const TONE_VAR: Record<BadgeTone, string> = {
  fg: 'var(--fg)',
  muted: 'var(--muted)',
  accent: 'var(--accent)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
  info: 'var(--info)',
};

const STATUS_TONE: Record<string, BadgeTone> = {
  BACKLOG: 'muted',
  TODO: 'muted',
  IN_PROGRESS: 'accent',
  BLOCKED: 'danger',
  IN_REVIEW: 'info',
  DONE: 'ok',
  CANCELLED: 'muted',
};

const PRIORITY_TONE: Record<string, BadgeTone> = {
  LOW: 'muted',
  MEDIUM: 'fg',
  HIGH: 'warn',
  URGENT: 'danger',
};

/** Punto + texto coloreado. Restraint atelier: sin pills rellenas chillonas. */
export function Dot({ tone }: { tone: BadgeTone }) {
  return <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONE_VAR[tone] }} />;
}

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'muted';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: TONE_VAR[tone] }}>
      <Dot tone={tone} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const tone = PRIORITY_TONE[priority] ?? 'muted';
  return (
    <span className="font-meta text-[11px] uppercase tracking-wide" style={{ color: TONE_VAR[tone] }}>
      {PRIORITY_LABEL[priority] ?? priority}
    </span>
  );
}
