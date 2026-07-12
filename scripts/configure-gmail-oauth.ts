import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { encryptSecret } from '../packages/database/src/index';

const REDIRECT_URI = 'http://127.0.0.1:53682/oauth/callback';
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const ENV_PATH = resolve(process.cwd(), '../../.env');

async function main(): Promise<void> {
if (process.argv.includes('--print-redirect-uri')) {
  console.log(REDIRECT_URI);
  return;
}

const source = await readFile(ENV_PATH, 'utf8');
const env = parseEnv(source);
const clientId = required(env, 'GOOGLE_GMAIL_CLIENT_ID');
const clientSecret = required(env, 'GOOGLE_GMAIL_CLIENT_SECRET');
const sender = required(env, 'GOOGLE_GMAIL_SENDER');
if (!process.env.WORKLOG_ENCRYPTION_KEY && env.WORKLOG_ENCRYPTION_KEY) {
  process.env.WORKLOG_ENCRYPTION_KEY = env.WORKLOG_ENCRYPTION_KEY;
}

const state = randomBytes(32).toString('base64url');
const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authorizationUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline',
  prompt: 'consent',
  state,
  login_hint: sender,
}).toString();

const code = await receiveAuthorizationCode(state, authorizationUrl.toString());
const response = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  redirect: 'error',
  signal: AbortSignal.timeout(10_000),
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  }),
});
if (!response.ok) throw new Error(`Google OAuth rechazó el intercambio (${response.status}).`);
const token = await response.json() as { refresh_token?: unknown; scope?: unknown };
if (typeof token.refresh_token !== 'string' || !token.refresh_token) {
  throw new Error('Google no devolvió refresh token; revocá el grant previo y repetí el consentimiento.');
}
if (typeof token.scope !== 'string' || !token.scope.split(' ').includes(SCOPE)) {
  throw new Error('El grant no incluye exclusivamente la capacidad gmail.send requerida.');
}
const updated = setEnvValue(source, 'GOOGLE_GMAIL_REFRESH_TOKEN_ENCRYPTED', encryptSecret(token.refresh_token));
const temporary = `${ENV_PATH}.gmail-oauth.tmp`;
try {
  await writeFile(temporary, updated, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await rename(temporary, ENV_PATH);
} finally {
  await rm(temporary, { force: true });
}
console.log('OAuth Gmail configurado: refresh token cifrado guardado en .env (valor no mostrado).');
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Falló la configuración OAuth Gmail.');
  process.exitCode = 1;
});

function receiveAuthorizationCode(expectedState: string, url: string): Promise<string> {
  return new Promise((resolveCode, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('El consentimiento OAuth venció después de 5 minutos.'));
    }, 5 * 60_000);
    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', REDIRECT_URI);
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.setHeader('referrer-policy', 'no-referrer');
      response.setHeader('cache-control', 'no-store');
      if (requestUrl.pathname !== '/oauth/callback') {
        response.writeHead(404).end('Not found');
        return;
      }
      const receivedState = requestUrl.searchParams.get('state') ?? '';
      const code = requestUrl.searchParams.get('code');
      const validState = receivedState.length === expectedState.length
        && timingSafeEqual(Buffer.from(receivedState), Buffer.from(expectedState));
      if (!validState || !code || requestUrl.searchParams.has('error')) {
        response.writeHead(400).end('<p>Autorización inválida. Podés cerrar esta ventana.</p>');
        clearTimeout(timeout);
        server.close();
        reject(new Error('Google OAuth devolvió una respuesta inválida o denegada.'));
        return;
      }
      response.writeHead(200).end('<p>Autorización recibida. Podés cerrar esta ventana.</p>');
      clearTimeout(timeout);
      server.close();
      resolveCode(code);
    });
    server.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    server.listen(53682, '127.0.0.1', () => openSystemBrowser(url));
  });
}

function openSystemBrowser(url: string): void {
  const command = process.platform === 'win32' ? 'rundll32' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

function parseEnv(sourceText: string): Record<string, string> {
  return Object.fromEntries(sourceText.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) return [];
    const value = match[2]!.trim();
    return [[match[1]!, value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value]];
  }));
}

function setEnvValue(sourceText: string, name: string, value: string): string {
  const line = `${name}="${value}"`;
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  return pattern.test(sourceText) ? sourceText.replace(pattern, line) : `${sourceText.trimEnd()}\r\n${line}\r\n`;
}

function required(values: Record<string, string>, name: string): string {
  const value = values[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio en .env.`);
  return value;
}
