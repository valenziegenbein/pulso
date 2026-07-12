import { NextResponse } from 'next/server';
import { billingProviderFromEnvironment, billingProviderKind } from '@/server/billing/config';
import { MercadoPagoWebhookSignatureError } from '@/server/billing/mercado-pago';
import { processBillingWebhook } from '@/server/billing/service';

const MAX_WEBHOOK_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  if (billingProviderKind() !== 'MERCADO_PAGO') return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }
  let rawBody: string;
  try {
    rawBody = await readLimitedBody(request);
  } catch (error) {
    if (error instanceof WebhookPayloadTooLargeError) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const url = new URL(request.url);
  const input = {
    rawBody,
    signature: request.headers.get('x-signature') ?? '',
    requestId: request.headers.get('x-request-id') ?? '',
    dataId: url.searchParams.get('data.id') ?? '',
  };
  try {
    const provider = billingProviderFromEnvironment();
    const result = await processBillingWebhook(provider, input);
    return NextResponse.json({ received: true, duplicate: result.duplicate }, { status: 200 });
  } catch (error) {
    if (error instanceof MercadoPagoWebhookSignatureError) {
      return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
    }
    console.error('billing_webhook_failed', {
      requestId: input.requestId.slice(0, 64),
      error: error instanceof Error ? error.message.replace(/[\r\n\t]/g, ' ').slice(0, 160) : 'unknown',
    });
    return NextResponse.json({ error: 'webhook_failed' }, { status: 500 });
  }
}

async function readLimitedBody(request: Request): Promise<string> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_WEBHOOK_BYTES) throw new WebhookPayloadTooLargeError();
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(body);
}

class WebhookPayloadTooLargeError extends Error {}
