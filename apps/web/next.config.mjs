import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.openai.com https://api.anthropic.com",
          },
        ],
      },
    ];
  },
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
