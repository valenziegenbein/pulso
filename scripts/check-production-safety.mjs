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
if (!compose.includes('PULSO_PERSONAL_API_ENABLED: \'false\'')
  || !compose.includes('PULSO_PERSONAL_ACCOUNT_AI_ENABLED: ${PULSO_PERSONAL_ACCOUNT_AI_ENABLED:-false}')
  || !compose.includes('PULSO_PERSONAL_ACCOUNT_AI_DATA_TERMS_ACK: ${PULSO_PERSONAL_ACCOUNT_AI_DATA_TERMS_ACK:-}')) {
  failures.push('docker-compose.yml: Personal público o Personal AI no fallan cerrados');
}
if (!/postgres:16@sha256:[0-9a-f]{64}/.test(compose) || !/caddy:2@sha256:[0-9a-f]{64}/.test(compose)) {
  failures.push('docker-compose.yml: las imágenes base no están fijadas por digest');
}

const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
if (!/node:22-bookworm-slim@sha256:[0-9a-f]{64}/.test(dockerfile)) {
  failures.push('Dockerfile: la imagen Node no está fijada por digest');
}

if (!dockerfile.includes('apps/web/.next/standalone/apps/web/.next/static')
  || !dockerfile.includes('cp -R apps/web/.next/static')) {
  failures.push('Dockerfile: el server standalone no incluye los assets estaticos de Next');
}

const deploySmoke = await readFile(new URL('../ops/smoke.sh', import.meta.url), 'utf8');
if (!deploySmoke.includes('/_next/static/css/') || !deploySmoke.includes('$SMOKE_BASE_URL$stylesheet')) {
  failures.push('ops/smoke.sh: falta validar una hoja de estilos real');
}

const caddy = await readFile(new URL('../Caddyfile', import.meta.url), 'utf8');
if (!caddy.includes('@blocked_register') || !caddy.includes('@blocked_personal_api')) {
  failures.push('Caddyfile: faltan bloqueos defensivos de registro o Personal API');
}

const mercadoPagoSmoke = await readFile(new URL('../scripts/smoke-mercado-pago-sandbox.ts', import.meta.url), 'utf8');
if (!mercadoPagoSmoke.includes('process.env.MERCADO_PAGO_TEST_SELLER_ACCESS_TOKEN')
  || mercadoPagoSmoke.includes('const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN')) {
  failures.push('smoke Mercado Pago: debe usar exclusivamente el token del vendedor sintético');
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log('Production database safety checks: OK');
