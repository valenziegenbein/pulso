import { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma como singleton (evita múltiples conexiones en dev/HMR).
 * Capa de infraestructura: los casos de uso del dominio dependen de los
 * puertos de `@pulso/domain`, no de este cliente directamente.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
