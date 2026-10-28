import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import express from 'express';
import { initialFarmers } from '../src/data/mockFarmers';
import type { SmartEsgpRequest } from '../src/server/auth';
import { createAuthConfig } from '../src/server/auth';
import { createSmartEsgpRepository } from '../src/server/smartEsgpRepository';
import { createWhatsAppRouter } from '../src/server/whatsappRoutes';
import { createWhatsAppCloudApiConfig } from '../src/services/whatsappCloudApi';
import { createWhatsAppMediaStorageConfig } from '../src/services/whatsappMediaStorage';

const appSecret = 'delivery-status-app-secret';
const repository = createSmartEsgpRepository(initialFarmers);
const app = express();

app.use(express.json({
  verify: (req, _res, buffer) => {
    (req as SmartEsgpRequest).rawBody = Buffer.from(buffer);
  },
}));

app.use(createWhatsAppRouter({
  repository,
  authConfig: createAuthConfig({
    WHATSAPP_APP_SECRET: appSecret,
  } as NodeJS.ProcessEnv),
  cloudApiConfig: createWhatsAppCloudApiConfig({}),
  mediaStorageConfig: createWhatsAppMediaStorageConfig({}),
  includeWebhookRoutes: true,
  includeManualSendRoute: false,
  includeMonitoringRoutes: false,
  serviceName: 'whatsapp',
}));

const server = app.listen(0);
const address = server.address();
assert(address && typeof address === 'object', 'Expected delivery status smoke server to bind to a port.');
const base = `http://127.0.0.1:${address.port}`;

const body = JSON.stringify({
  entry: [
    {
      changes: [
        {
          value: {
            statuses: [
              {
                id: 'wamid.delivery-failed-1',
                status: 'failed',
                timestamp: '1784790000',
                recipient_id: '60129990001',
                conversation: {
                  id: 'conversation-1',
                },
                pricing: {
                  category: 'service',
                },
                errors: [
                  {
                    code: '131026',
                    title: 'Message undeliverable',
                    message: 'Recipient is unavailable.',
                  },
                ],
              },
              {
                id: 'wamid.delivery-read-1',
                status: 'read',
                timestamp: '1784790001',
                recipient_id: '60129990002',
              },
            ],
          },
        },
      ],
    },
  ],
});

const signature = crypto
  .createHmac('sha256', appSecret)
  .update(Buffer.from(body))
  .digest('hex');

try {
  const response = await fetch(`${base}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${signature}`,
    },
    body,
  });
  assert.equal(response.status, 200);

  const data = await response.json() as {
    inboundCount?: number;
    deliveryStatusCount?: number;
    replyCount?: number;
  };
  assert.equal(data.inboundCount, 0);
  assert.equal(data.deliveryStatusCount, 2);
  assert.equal(data.replyCount, 0);

  const failedDeliveryEvents = await repository.listSystemAuditEvents(10, {
    action: 'whatsapp.delivery.status',
    severity: 'error',
    entityType: 'whatsapp_message',
  });
  assert.equal(failedDeliveryEvents.length, 1);
  assert.equal(failedDeliveryEvents[0].entityId, 'wamid.delivery-failed-1');
  assert.match(failedDeliveryEvents[0].message, /Recipient is unavailable/);
  assert.equal(failedDeliveryEvents[0].metadata?.status, 'failed');
  assert.equal(failedDeliveryEvents[0].metadata?.recipientPhone, 'wa-****0001');
  assert.match(String(failedDeliveryEvents[0].metadata?.errorSummary), /Recipient is unavailable/);

  const infoDeliveryEvents = await repository.listSystemAuditEvents(10, {
    action: 'whatsapp.delivery.status',
    severity: 'info',
  });
  assert.equal(infoDeliveryEvents.length, 1);
  assert.equal(infoDeliveryEvents[0].entityId, 'wamid.delivery-read-1');

  console.log(JSON.stringify({
    ok: true,
    deliveryStatusCount: data.deliveryStatusCount,
    failedAuditEvent: failedDeliveryEvents[0].entityId,
    infoAuditEvent: infoDeliveryEvents[0].entityId,
  }, null, 2));
} finally {
  server.close();
}
