const SENSITIVE_KEY = /password|secret|token|authorization|cookie|api.?key|content|prompt|email/i;

export function getRequestId(request: Request): string {
  const value = request.headers.get('x-request-id');
  return value && /^[a-zA-Z0-9_-]{8,64}$/.test(value) ? value : 'missing';
}

export function logServer(
  level: 'info' | 'warn' | 'error',
  event: string,
  input: { requestId?: string; error?: unknown; metadata?: Record<string, unknown> } = {},
): void {
  const record = {
    ts: new Date().toISOString(),
    level,
    event,
    requestId: input.requestId ?? 'none',
    ...(input.error ? { error: sanitizeError(input.error) } : {}),
    ...(input.metadata ? { metadata: sanitizeObject(input.metadata) } : {}),
  };
  const line = JSON.stringify(record);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

function sanitizeError(error: unknown): { name: string; message: string } {
  if (!(error instanceof Error)) return { name: 'UnknownError', message: 'Error no identificado.' };
  return { name: error.name, message: redact(error.message).slice(0, 500) };
}

function sanitizeObject(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeValue(value)]),
  );
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') return redact(value).slice(0, 500);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  return '[OMITTED]';
}

function redact(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .replace(/([?&](?:token|key|secret)=)[^&\s]+/gi, '$1[REDACTED]');
}
