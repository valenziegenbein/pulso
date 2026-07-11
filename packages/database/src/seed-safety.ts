export function assertSeedAllowed(environment = process.env.NODE_ENV): void {
  if (environment === 'production') {
    throw new Error('Seed bloqueado: nunca se permite ejecutar prisma/seed.ts con NODE_ENV=production.');
  }
}
