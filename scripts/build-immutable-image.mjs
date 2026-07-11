import { spawn } from 'node:child_process';

function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(`${command} terminó con ${code}`)));
  });
}

const status = await capture('git', ['status', '--porcelain']);
if (status) throw new Error('Build inmutable bloqueado: el worktree debe estar limpio y versionado.');

const sha = await capture('git', ['rev-parse', 'HEAD']);
if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('No se pudo resolver un Git SHA completo.');
const repository = process.env.PULSO_IMAGE_REPOSITORY ?? 'pulso';
const image = `${repository}:${sha}`;

await new Promise((resolve, reject) => {
  const child = spawn('docker', [
    'build',
    '--build-arg', `PULSO_GIT_SHA=${sha}`,
    '--label', `org.opencontainers.image.revision=${sha}`,
    '--tag', image,
    '.',
  ], { shell: false, stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`docker build terminó con ${code}`)));
});

const imageId = await capture('docker', ['image', 'inspect', '--format', '{{.Id}}', image]);
console.log(`Imagen local: ${image}`);
console.log(`Image ID local: ${imageId}`);
console.log('El digest distribuible debe obtenerse del registry después de un push autorizado; no se inventó ninguno.');
