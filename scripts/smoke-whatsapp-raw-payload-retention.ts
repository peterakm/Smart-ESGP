import assert from 'node:assert/strict';
import express from 'express';
import { initialFarmers } from '../src/data/mockFarmers';
import { createAuthConfig } from '../src/server/auth';
import { createSmartEsgpRepository, type SmartEsgpRepository } from '../src/server/smartEsgpRepository';
import { createWhatsAppRouter } from '../src/server/whatsappRoutes';
import { createWhatsAppCloudApiConfig } from '../src/services/whatsappCloudApi';
import { createWhatsAppMediaStorageConfig } from '../src/services/whatsappMediaStorage';

const webhookBody = (providerMessageId: string) => JSON.stringify({
  entry: [
    {
      changes: [
        {
          value: {
            messages: [
              {
                from: '60129990001',
                id: providerMessageId,
                timestamp: '1784791000',
                type: 'text',
                text: { body: 'BM' },
                context: {
                  forwarded: true,
                },
              },
            ],
          },
        },
      ],
    },
  ],
});

const createServer = (repository: SmartEsgpRepository, retainRawPayloads: boolean) => {
  const app = express();
  app.use(express.json());
  app.use(createWhatsAppRouter({
    repository,
    authConfig: createAuthConfig({}),
    cloudApiConfig: createWhatsAppCloudApiConfig({}),
    mediaStorageConfig: createWhatsAppMediaStorageConfig({}),
    includeWebhookRoutes: true,
    includeManualSendRoute: false,
    includeMonitoringRoutes: false,
    retainRawPayloads,
    serviceName: 'whatsapp',
  }));

  const server = app.listen(0);
  const address = server.address();
  assert(address && typeof address === 'object', 'Expected raw retention smoke server to bind to a port.');

  return {
    server,
    base: `http://127.0.0.1:${address.port}`,
  };
};

const postWebhook = async (base: string, providerMessageId: string) => {
  const response = await fetch(`${base}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: webhookBody(providerMessageId),
  });

  assert.equal(response.status, 200);
};

const retainedRepository = createSmartEsgpRepository(initialFarmers);
const retainedServer = createServer(retainedRepository, true);

try {
  await postWebhook(retainedServer.base, 'raw-retained-1');
  const [event] = await retainedRepository.listWhatsAppEvents(1);
  assert.equal(event.inbound.providerMessageId, 'raw-retained-1');
  assert(event.inbound.raw && typeof event.inbound.raw === 'object', 'Expected raw payload to be retained when enabled.');
} finally {
  retainedServer.server.close();
}

const strippedRepository = createSmartEsgpRepository(initialFarmers);
const strippedServer = createServer(strippedRepository, false);

try {
  await postWebhook(strippedServer.base, 'raw-stripped-1');
  const [event] = await strippedRepository.listWhatsAppEvents(1);
  assert.equal(event.inbound.providerMessageId, 'raw-stripped-1');
  assert.equal(event.inbound.raw, undefined);

  const [auditEvent] = await strippedRepository.listSystemAuditEvents(1, {
    action: 'whatsapp.webhook.processed',
  });
  assert.equal(auditEvent.metadata?.rawPayloadsRetained, false);

  console.log(JSON.stringify({
    ok: true,
    retainedRawPayload: true,
    strippedRawPayload: event.inbound.raw === undefined,
    auditMetadata: auditEvent.metadata?.rawPayloadsRetained,
  }, null, 2));
} finally {
  strippedServer.server.close();
}
