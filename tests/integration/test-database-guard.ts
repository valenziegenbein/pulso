const marker = process.env.PULSO_INTEGRATION_TEST;
const testUrl = process.env.TEST_DATABASE_URL;
const databaseUrl = process.env.DATABASE_URL;

if (marker !== 'ephemeral-postgres') {
  throw new Error('Tests DB bloqueados: falta PULSO_INTEGRATION_TEST=ephemeral-postgres.');
}
if (!testUrl || databaseUrl !== testUrl) {
  throw new Error('Tests DB bloqueados: TEST_DATABASE_URL debe existir y coincidir exactamente con DATABASE_URL.');
}

const parsed = new URL(testUrl);
const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
const allowedDatabases = new Set(['pulso_test', 'pulso_upgrade']);
const databaseName = parsed.pathname.replace(/^\//, '');

if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
  throw new Error('Tests DB bloqueados: sólo se admite PostgreSQL.');
}
if (!localHosts.has(parsed.hostname) || parsed.username !== 'pulso_test' || !allowedDatabases.has(databaseName)) {
  throw new Error('Tests DB bloqueados: el destino no coincide con el PostgreSQL efímero permitido.');
}
