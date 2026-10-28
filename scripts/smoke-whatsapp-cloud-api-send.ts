import assert from 'node:assert/strict';
import { sendWhatsAppTextMessage, type WhatsAppCloudApiConfig } from '../src/services/whatsappCloudApi';

const originalFetch = globalThis.fetch;

const liveConfig: WhatsAppCloudApiConfig = {
  graphApiVersion: 'v23.0',
  accessToken: 'test-access-token',
  phoneNumberId: '123456789012345',
  requestTimeoutMs: 1000,
};

const request = {
  toPhone: '60123456789',
  text: 'Test message',
};

const withMockFetch = async (
  mockFetch: typeof fetch,
  run: () => Promise<void>
) => {
  globalThis.fetch = mockFetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

await withMockFetch(async (url, init) => {
  assert.equal(String(url), 'https://graph.facebook.com/v23.0/123456789012345/messages');
  assert.equal(init?.method, 'POST');
  assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer test-access-token');

  return new Response(JSON.stringify({
    messages: [{ id: 'wamid.sent-1' }],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}, async () => {
  const result = await sendWhatsAppTextMessage(liveConfig, request);
  assert.equal(result.mode, 'sent');
  assert.equal(result.statusCode, 200);
  assert.equal(result.providerMessageId, 'wamid.sent-1');
});

await withMockFetch(async () => {
  return new Response('<html>Meta temporary error</html>', { status: 503 });
}, async () => {
  const result = await sendWhatsAppTextMessage(liveConfig, request);
  assert.equal(result.mode, 'failed');
  assert.equal(result.statusCode, 503);
  assert.match(result.error || '', /Meta temporary error/);
});

await withMockFetch(async () => {
  throw new Error('socket hang up');
}, async () => {
  const result = await sendWhatsAppTextMessage(liveConfig, request);
  assert.equal(result.mode, 'failed');
  assert.match(result.error || '', /socket hang up/);
});

await withMockFetch(async (_url, init) => {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });
}, async () => {
  const result = await sendWhatsAppTextMessage({
    ...liveConfig,
    requestTimeoutMs: 1,
  }, request);
  assert.equal(result.mode, 'failed');
  assert.equal(result.error, 'WhatsApp Cloud API request timed out.');
});

console.log(JSON.stringify({
  ok: true,
  covered: [
    'sent-json',
    'failed-non-json',
    'network-error',
    'timeout',
  ],
}, null, 2));
