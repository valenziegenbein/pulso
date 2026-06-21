import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Build autocontenido para empaquetar en la app de escritorio (Electron).
  output: 'standalone',
  // En un monorepo, trazar dependencias desde la raíz del workspace.
  outputFileTracingRoot: join(__dirname, '../../'),
  // Los paquetes del workspace se transpilan desde su código fuente (sin build step).
  transpilePackages: ['@pulso/shared', '@pulso/domain', '@pulso/llm', '@pulso/database'],
  // Prisma no se empaqueta en el bundle: queda como dependencia externa del server.
  serverExternalPackages: ['@prisma/client'],
};

export default nextConfig;
