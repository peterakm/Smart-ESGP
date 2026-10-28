import assert from 'node:assert/strict';
import express from 'express';
import { initialFarmers } from '../src/data/mockFarmers';
import { createAuthConfig } from '../src/server/auth';
import { createSmartEsgpRepository } from '../src/server/smartEsgpRepository';
import { createWhatsAppRouter } from '../src/server/whatsappRoutes';
import { createWhatsAppCloudApiConfig } from '../src/services/whatsappCloudApi';
import { createWhatsAppMediaStorageConfig } from '../src/services/whatsappMediaStorage';
import type { WhatsAppSendResult, WhatsAppWebhookEvent } from '../src/contracts/whatsapp';

const makeEvent = (
  providerMessageId: string,
  outbound: WhatsAppSendResult,
  farmerId = 'f-1'
): WhatsAppWebhookEvent => ({
  inbound: {
    provider: 'whatsapp-cloud-api',
    providerMessageId,
    fromPhone: '60125550123',
    receivedAt: '2026-07-24T02:00:00.000Z',
    kind: 'text',
    text: 'BM',
    raw: {
      provider: 'raw-payload-should-not-leak',
    },
  },
  reply: {
    toPhone: '60125550123',
    text: 'Reply should remain available but recipient should not.',
    intent: 'onboarding',
    farmerId,
  },
  outbound,
  session: {
    phoneNumber: '60125550123',
    farmerId,
    step: 'active',
    createdAt: '2026-07-24T02:00:00.000Z',
    updatedAt: '2026-07-24T02:00:01.000Z',
  },
  storedAt: '2026-07-24T02:00:01.000Z',
});

const repository = createSmartEsgpRepository(initialFarmers);
await repository.recordWhatsAppEvents([
  makeEvent('monitoring-sent-1', {
    toPhone: '60125550123',
    text: 'Sent body',
    mode: 'sent',
    providerMessageId: 'wamid.sent-1',
    statusCode: 200,
    sentAt: '2026-07-24T02:00:02.000Z',
  }),
  makeEvent('monitoring-failed-1', {
    toPhone: '60125550123',
    text: 'Failed body',
    mode: 'failed',
    statusCode: 503,
    error: 'Meta temporary failure',
    sentAt: '2026-07-24T02:00:03.000Z',
  }),
  makeEvent('monitoring-dry-run-1', {
    toPhone: '60125550123',
    text: 'Dry-run body',
    mode: 'dry_run',
    sentAt: '2026-07-24T02:00:04.000Z',
  }),
]);

const app = express();
const viewerToken = 'viewer-monitoring-token';
app.use(createWhatsAppRouter({
  repository,
  authConfig: createAuthConfig({
    SMART_ESGP_REQUIRE_AUTH: 'true',
    SMART_ESGP_VIEWER_TOKEN: viewerToken,
  } as NodeJS.ProcessEnv),
  cloudApiConfig: createWhatsAppCloudApiConfig({}),
  mediaStorageConfig: createWhatsAppMediaStorageConfig({}),
  includeWebhookRoutes: false,
  includeManualSendRoute: false,
  includeMonitoringRoutes: true,
  serviceName: 'dashboard',
}));

const server = app.listen(0);
const address = server.address();
assert(address && typeof address === 'object', 'Expected monitoring smoke server to bind to a port.');
const base = `http://127.0.0.1:${address.port}`;

try {
  const response = await fetch(`${base}/api/whatsapp/events?outboundMode=failed&limit=10`, {
    headers: { authorization: `Bearer ${viewerToken}` },
  });
  assert.equal(response.status, 200);
  const data = await response.json() as {
    filters?: { outboundMode?: string };
    events?: Array<Record<string, any>>;
  };
  assert.equal(data.filters?.outboundMode, 'failed');
  assert.equal(data.events?.length, 1);
  assert.equal(data.events?.[0]?.inbound?.providerMessageId, 'monitoring-failed-1');
  assert.equal(data.events?.[0]?.outbound?.mode, 'failed');
  assert.equal(data.events?.[0]?.outbound?.error, 'Meta temporary failure');
  assert.equal('raw' in (data.events?.[0]?.inbound || {}), false);
  assert.equal('toPhone' in (data.events?.[0]?.reply || {}), false);
  assert.equal('toPhone' in (data.events?.[0]?.outbound || {}), false);
  assert.equal('text' in (data.events?.[0]?.outbound || {}), false);

  const farmerResponse = await fetch(`${base}/api/whatsapp/farmers/f-1/events?outboundMode=dry_run&limit=10`, {
    headers: { authorization: `Bearer ${viewerToken}` },
  });
  assert.equal(farmerResponse.status, 200);
  const farmerData = await farmerResponse.json() as {
    farmerId?: string;
    filters?: { outboundMode?: string };
    events?: Array<Record<string, any>>;
  };
  assert.equal(farmerData.farmerId, 'f-1');
  assert.equal(farmerData.filters?.outboundMode, 'dry_run');
  assert.deepEqual(
    farmerData.events?.map((event) => event.inbound?.providerMessageId),
    ['monitoring-dry-run-1']
  );

  console.log(JSON.stringify({
    ok: true,
    failedFilter: data.events?.[0]?.inbound?.providerMessageId,
    farmerDryRunFilter: farmerData.events?.[0]?.inbound?.providerMessageId,
    sanitized: true,
  }, null, 2));
} finally {
  server.close();
}
