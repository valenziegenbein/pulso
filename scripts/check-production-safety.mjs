import { readFile } from 'node:fs/promises';

const productionFiles = [
  'package.json',
  'packages/database/package.json',
  'Dockerfile',
  'docker-compose.yml',
  'docker-entrypoint.sh',
  'docker-migrate.sh',
];

const failures = [];
for (const file of productionFiles) {
  const content = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  if (/prisma\s+db\s+push/i.test(content)) failures.push(`${file}: contiene prisma db push`);
}

const entrypoint = await readFile(new URL('../docker-entrypoint.sh', import.meta.url), 'utf8');
if (/migrate:deploy|migrate\s+deploy/i.test(entrypoint)) {
  failures.push('docker-entrypoint.sh: las migraciones no deben ejecutarse durante el arranque normal');
}
if (!entrypoint.includes('export HOSTNAME=0.0.0.0')) {
  failures.push('docker-entrypoint.sh: el server standalone debe escuchar en todas las interfaces');
}

const seed = await readFile(new URL('../packages/database/prisma/seed.ts', import.meta.url), 'utf8');
const seedSafety = await readFile(new URL('../packages/database/src/seed-safety.ts', import.meta.url), 'utf8');
if (!seed.includes('assertSeedAllowed()') || !seedSafety.includes("environment === 'production'")) {
  failures.push('seed.ts: falta bloqueo explícito para producción');
}

const compose = await readFile(new URL('../docker-compose.yml', import.meta.url), 'utf8');
if (!compose.includes('/api/readiness') || !compose.includes("profiles: ['ops']")) {
  failures.push('docker-compose.yml: falta readiness o job de migración explícito');
}
if (!compose.includes('PULSO_BILLING_PROVIDER: ${PULSO_BILLING_PROVIDER:-MERCADO_PAGO_MOCK}')
  || !compose.includes('PULSO_MERCADO_PAGO_LIVE_ENABLED: ${PULSO_MERCADO_PAGO_LIVE_ENABLED:-false}')
  || !compose.includes('PULSO_MERCADO_PAGO_CHECKOUT_ENABLED: ${PULSO_MERCADO_PAGO_CHECKOUT_ENABLED:-false}')) {
  failures.push('docker-compose.yml: billing no falla cerrado en mock/live=false');
}
if (!/postgres:16@sha256:[0-9a-f]{64}/.test(compose) || !/caddy:2@sha256:[0-9a-f]{64}/.test(compose)) {
  failures.push('docker-compose.yml: las imágenes base no están fijadas por digest');
}

const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
if (!/node:22-bookworm-slim@sha256:[0-9a-f]{64}/.test(dockerfile)) {
  failures.push('Dockerfile: la imagen Node no está fijada por digest');
}

const caddy = await readFile(new URL('../Caddyfile', import.meta.url), 'utf8');
if (!caddy.includes('@blocked_register') || !caddy.includes('@blocked_personal_api')) {
  failures.push('Caddyfile: faltan bloqueos defensivos de registro o Personal API');
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log('Production database safety checks: OK');
