import { redirect } from 'next/navigation';
import { prisma } from '@pulso/database';
import { getSessionIdentity } from '@/lib/auth/context';
import { selectOrganizationAction } from '@/server/actions/auth';

export default async function SelectOrganizationPage() {
  const session = await getSessionIdentity();
  if (!session) redirect('/login');
  if (session.activeOrganizationId) redirect('/');

  const memberships = await prisma.orgMembership.findMany({
    where: { userId: session.userId },
    select: { organizationId: true, organization: { select: { name: true } } },
    orderBy: [{ createdAt: 'asc' }, { organizationId: 'asc' }],
  });
  if (memberships.length === 0) redirect('/login');

  return (
    <main className="theme-teams flex min-h-screen items-center justify-center px-6 py-10">
      <section className="w-full max-w-md rounded-2xl border border-border bg-surface p-6">
        <h1 className="font-display text-3xl">Elegí una organización</h1>
        <p className="mt-2 text-sm text-muted">Esta selección define el workspace activo de la sesión.</p>
        <div className="mt-6 space-y-3">
          {memberships.map((membership) => (
            <form key={membership.organizationId} action={selectOrganizationAction}>
              <input type="hidden" name="organizationId" value={membership.organizationId} />
              <button className="w-full rounded-xl border border-border px-4 py-3 text-left transition hover:border-accent">
                {membership.organization.name}
              </button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}
