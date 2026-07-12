import { spawn } from 'node:child_process';
import process from 'node:process';

const port = Number(process.env.PULSO_TEST_DB_PORT ?? 55432);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('PULSO_TEST_DB_PORT inválido.');
}

const compose = ['compose', '-p', 'pulso-integration', '-f', 'docker-compose.integration.yml'];
const baseUrl = `postgresql://pulso_test:pulso_test_only@127.0.0.1:${port}`;
const emptyUrl = `${baseUrl}/pulso_test?schema=public`;
const shadowUrl = `${baseUrl}/pulso_shadow?schema=public`;
const upgradeUrl = `${baseUrl}/pulso_upgrade?schema=public`;
const invalidUpgradeUrl = `${baseUrl}/pulso_invalid_upgrade?schema=public`;
const pnpmScript = process.env.npm_execpath;

const testEnv = (url) => ({
  ...process.env,
  DATABASE_URL: url,
  TEST_DATABASE_URL: url,
  PULSO_INTEGRATION_TEST: 'ephemeral-postgres',
  NODE_ENV: 'test',
  PULSO_TEST_DB_PORT: String(port),
});

async function run(label, command, args, { env = process.env, capture = false, allowFailure = false } = {}) {
  console.log(`\n==> ${label}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      shell: false,
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    });
    let stdout = '';
    if (capture) child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0 || allowFailure) resolve({ code: code ?? 1, stdout: stdout.trim() });
      else reject(new Error(`${label} falló con exit code ${code ?? 'unknown'}.`));
    });
  });
}

async function runPnpm(label, args, options = {}) {
  if (pnpmScript) return run(label, process.execPath, [pnpmScript, ...args], options);
  return run(label, 'pnpm', args, options);
}

async function docker(...args) {
  return run(`docker ${args.join(' ')}`, 'docker', [...compose, ...args]);
}

async function psql(database, ...args) {
  return run(
    `psql sintético en ${database}`,
    'docker',
    [...compose, 'exec', '-T', 'db-test', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'pulso_test', '-d', database, ...args],
    { capture: args.includes('-Atc') },
  );
}

const countSql = [
  "SELECT concat_ws(',',",
  "  (SELECT count(*) FROM \"Organization\"),",
  "  (SELECT count(*) FROM \"User\"),",
  "  (SELECT count(*) FROM \"OrgMembership\"),",
  "  (SELECT count(*) FROM \"Team\"),",
  "  (SELECT count(*) FROM \"Task\"),",
  "  (SELECT count(*) FROM \"WorklogEntry\")",
  ');',
].join(' ');

let succeeded = false;
try {
  await run('verificar Docker', 'docker', ['version', '--format', '{{.Server.Version}}']);
  await docker('down', '--volumes', '--remove-orphans');
  await docker('up', '-d', '--wait');
  await run('crear base shadow efímera', 'docker', [...compose, 'exec', '-T', 'db-test', 'createdb', '-U', 'pulso_test', 'pulso_shadow']);
  await run('crear base de upgrade efímera', 'docker', [...compose, 'exec', '-T', 'db-test', 'createdb', '-U', 'pulso_test', 'pulso_upgrade']);
  await run('crear base de preflight inválido', 'docker', [...compose, 'exec', '-T', 'db-test', 'createdb', '-U', 'pulso_test', 'pulso_invalid_upgrade']);

  await runPnpm('aplicar migraciones desde base vacía', ['--filter', '@pulso/database', 'run', 'migrate:deploy'], { env: testEnv(emptyUrl) });
  await runPnpm('verificar migrate status en base vacía', ['--filter', '@pulso/database', 'exec', 'prisma', 'migrate', 'status'], { env: testEnv(emptyUrl) });
  await runPnpm('detectar drift migraciones versus schema', [
    '--filter', '@pulso/database', 'exec', 'prisma', 'migrate', 'diff',
    '--from-migrations', 'prisma/migrations',
    '--to-schema-datamodel', 'prisma/schema.prisma',
    '--shadow-database-url', shadowUrl,
    '--exit-code',
  ], { env: testEnv(emptyUrl) });
  await runPnpm('ejecutar suite PostgreSQL DB-backed', ['exec', 'vitest', 'run', '--config', 'vitest.integration.config.ts'], { env: testEnv(emptyUrl) });

  await psql('pulso_upgrade', '-f', '/workspace/packages/database/prisma/migrations/20260624213924_init/migration.sql');
  await runPnpm('registrar migración inicial del snapshot sintético', [
    '--filter', '@pulso/database', 'exec', 'prisma', 'migrate', 'resolve', '--applied', '20260624213924_init',
  ], { env: testEnv(upgradeUrl) });
  await psql('pulso_upgrade', '-f', '/workspace/tests/integration/fixtures/production-equivalent.sql');
  const before = await psql('pulso_upgrade', '-Atc', countSql);

  await runPnpm('aplicar migraciones pendientes al snapshot sintético', ['--filter', '@pulso/database', 'run', 'migrate:deploy'], { env: testEnv(upgradeUrl) });
  await runPnpm('verificar migrate status después del upgrade', ['--filter', '@pulso/database', 'exec', 'prisma', 'migrate', 'status'], { env: testEnv(upgradeUrl) });
  const after = await psql('pulso_upgrade', '-Atc', countSql);
  if (before.stdout !== after.stdout) {
    throw new Error(`El upgrade alteró conteos: antes=${before.stdout}, después=${after.stdout}`);
  }
  console.log(`Conteos preservados (org,user,membership,team,task,worklog): ${after.stdout}`);
  await runPnpm('ejecutar smoke DB-backed posterior al upgrade', ['exec', 'vitest', 'run', '--config', 'vitest.upgrade.config.ts'], { env: testEnv(upgradeUrl) });

  await psql('pulso_invalid_upgrade', '-f', '/workspace/packages/database/prisma/migrations/20260624213924_init/migration.sql');
  await psql('pulso_invalid_upgrade', '-f', '/workspace/packages/database/prisma/migrations/20260625010000_org_plans/migration.sql');
  await runPnpm('registrar migraciones previas del preflight inválido', [
    '--filter', '@pulso/database', 'exec', 'prisma', 'migrate', 'resolve', '--applied', '20260624213924_init',
  ], { env: testEnv(invalidUpgradeUrl) });
  await runPnpm('registrar segunda migración del preflight inválido', [
    '--filter', '@pulso/database', 'exec', 'prisma', 'migrate', 'resolve', '--applied', '20260625010000_org_plans',
  ], { env: testEnv(invalidUpgradeUrl) });
  await psql('pulso_invalid_upgrade', '-f', '/workspace/tests/integration/fixtures/tenant-integrity-invalid.sql');
  const rejectedMigration = await runPnpm(
    'comprobar rechazo transaccional de datos cross-tenant',
    ['--filter', '@pulso/database', 'run', 'migrate:deploy'],
    { env: testEnv(invalidUpgradeUrl), allowFailure: true },
  );
  if (rejectedMigration.code === 0) {
    throw new Error('La migración tenant aceptó un fixture cross-tenant deliberadamente inválido.');
  }
  const partialColumn = await psql('pulso_invalid_upgrade', '-Atc', [
    "SELECT count(*) FROM information_schema.columns",
    "WHERE table_schema = 'public' AND table_name = 'TeamMembership' AND column_name = 'organizationId';",
  ].join(' '));
  if (partialColumn.stdout !== '0') {
    throw new Error('El preflight fallido dejó DDL parcial en TeamMembership.');
  }
  console.log('Preflight tenant: rechazo esperado y rollback transaccional OK');
  succeeded = true;
} finally {
  if (process.env.PULSO_KEEP_TEST_DB === '1') {
    console.warn('PULSO_KEEP_TEST_DB=1: PostgreSQL efímero quedó activo para diagnóstico.');
  } else {
    await docker('down', '--volumes', '--remove-orphans').catch((error) => {
      console.error(`No se pudo limpiar PostgreSQL efímero: ${error instanceof Error ? error.message : String(error)}`);
      if (succeeded) process.exitCode = 1;
    });
  }
}

if (succeeded) console.log('\nPostgreSQL integration and migration gate: OK');
