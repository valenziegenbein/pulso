// Prepara el build standalone de Next para empaquetar: copia los estáticos y
// public (que Next `output: standalone` no incluye) dentro del standalone.
// Requiere haber corrido antes: pnpm --filter web build
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..');
const nextDir = path.join(root, 'apps', 'web', '.next');
const sa = path.join(root, 'apps', 'web', '.next', 'standalone');
const serverJs = path.join(sa, 'apps', 'web', 'server.js');

// El instalador no debe depender de un `.next` previo potencialmente stale.
// Recompila siempre la Web que realmente va a quedar embebida.
fs.rmSync(nextDir, { recursive: true, force: true });
const pnpmCli = process.env.npm_execpath;
const buildCommand = pnpmCli
  ? process.execPath
  : process.platform === 'win32'
    ? process.env.ComSpec || 'cmd.exe'
    : 'pnpm';
const buildArgs = pnpmCli
  ? [pnpmCli, '--filter', 'web', 'build']
  : process.platform === 'win32'
    ? ['/d', '/s', '/c', 'pnpm --filter web build']
    : ['--filter', 'web', 'build'];
const build = spawnSync(buildCommand, buildArgs, {
  cwd: root,
  stdio: 'inherit',
});

if (build.error || build.status !== 0) {
  console.error('Falló el build Web requerido para empaquetar Desktop.');
  if (build.error) console.error(build.error.message);
  process.exit(build.status || 1);
}

if (!fs.existsSync(serverJs)) {
  console.error('El build Web terminó sin generar el server standalone.');
  process.exit(1);
}

const sourceStatic = path.join(root, 'apps', 'web', '.next', 'static');
const sourceCss = path.join(sourceStatic, 'css');
const cssFiles = fs.existsSync(sourceCss)
  ? fs.readdirSync(sourceCss).filter((name) => name.endsWith('.css'))
  : [];
const css = cssFiles.map((name) => fs.readFileSync(path.join(sourceCss, name), 'utf8')).join('\n');
const requiredUtilities = ['.flex{', '.grid{', '.rounded-2xl{', '.p-6{'];
const missingUtilities = requiredUtilities.filter((utility) => !css.includes(utility));

if (cssFiles.length === 0 || missingUtilities.length > 0) {
  console.error(
    `Build CSS incompleto: faltan utilidades Tailwind (${missingUtilities.join(', ') || 'sin archivos CSS'}).`,
  );
  process.exit(1);
}

const copies = [
  [path.join(root, 'apps', 'web', '.next', 'static'), path.join(sa, 'apps', 'web', '.next', 'static')],
  [path.join(root, 'apps', 'web', 'public'), path.join(sa, 'apps', 'web', 'public')],
];

for (const [src, dst] of copies) {
  if (fs.existsSync(src)) {
    fs.rmSync(dst, { recursive: true, force: true });
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
