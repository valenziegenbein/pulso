'use client';

import { useActionState } from 'react';
import { PLAN_KEY, PLAN_SEAT_LIMIT, type PlanKey } from '@pulso/shared';
import { registerOrganizationAction } from '@/server/actions/auth';
import type { RegisterState } from '@/server/action-types';

const INITIAL: RegisterState = {};
const PLAN_LABEL: Record<PlanKey, string> = {
  FREE: 'Gratis',
  TEAM: 'Team',
  BUSINESS: 'Business',
  ENTERPRISE: 'Enterprise',
};

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerOrganizationAction, INITIAL);

  return (
    <form action={action} className="space-y-3">
      <Field name="organizationName" label="Organizacion" placeholder="Ej: Acme Operaciones" />
      <Field name="adminName" label="Tu nombre" placeholder="Maria Salazar" />
      <Field name="adminEmail" label="Email" placeholder="maria@empresa.com" type="email" />
      <Field name="adminPassword" label="Contrasena" type="password" />
      <div>
        <label className="font-meta mb-1 block text-[10px] uppercase tracking-[0.16em] text-muted">Plan</label>
        <select
          name="planKey"
          defaultValue="FREE"
          className="w-full rounded-xl border border-border bg-bg/50 px-3 py-2 text-sm outline-none transition focus:border-accent"
        >
          {PLAN_KEY.map((plan) => (
            <option key={plan} value={plan}>
              {PLAN_LABEL[plan]} - {PLAN_SEAT_LIMIT[plan]} seats
            </option>
          ))}
        </select>
      </div>
      {state.error && <p className="text-xs text-[var(--danger)]">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
      >
        {pending ? 'Creando...' : 'Crear organizacion'}
      </button>
      <p className="text-center text-[11px] leading-relaxed text-muted/80">Billing real proximamente. Podes cambiar el plan despues.</p>
    </form>
  );
}

function Field({
  name,
  label,
  placeholder,
  type = 'text',
}: {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="font-meta mb-1 block text-[10px] uppercase tracking-[0.16em] text-muted">{label}</label>
      <input
        name={name}
        type={type}
        required
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-bg/50 px-3 py-2 text-sm outline-none transition focus:border-accent"
      />
    </div>
  );
}
