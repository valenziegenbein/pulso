// Prepara el build standalone de Next para empaquetar: copia los estáticos y
// public (que Next `output: standalone` no incluye) dentro del standalone.
// Requiere haber corrido antes: pnpm --filter web build
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const sa = path.join(root, 'apps', 'web', '.next', 'standalone');
const serverJs = path.join(sa, 'apps', 'web', 'server.js');

if (!fs.existsSync(serverJs)) {
  console.error('No existe el build standalone. Corré primero:  pnpm --filter web build');
  process.exit(1);
}

const copies = [
  [path.join(root, 'apps', 'web', '.next', 'static'), path.join(sa, 'apps', 'web', '.next', 'static')],
  [path.join(root, 'apps', 'web', 'public'), path.join(sa, 'apps', 'web', 'public')],
];

for (const [src, dst] of copies) {
  if (fs.existsSync(src)) {
    fs.cpSync(src, dst, { recursive: true });
    console.log(`copiado: ${path.relative(root, src)}  ->  standalone`);
  }
}

// DB SQLite semilla (migrada + seedeada) que la app copia a %APPDATA% en el
// primer arranque. Se genera con: pnpm db:migrate && pnpm db:seed
const devDb = path.join(root, 'packages', 'database', 'prisma', 'dev.db');
const templateDb = path.join(__dirname, 'db-template', 'pulso.db');
if (!fs.existsSync(devDb)) {
  console.error('No existe dev.db. Corré:  pnpm db:migrate && pnpm db:seed');
  process.exit(1);
}
fs.mkdirSync(path.dirname(templateDb), { recursive: true });
fs.copyFileSync(devDb, templateDb);
console.log('DB semilla copiada a db-template/pulso.db');

console.log('standalone listo para empaquetar.');
