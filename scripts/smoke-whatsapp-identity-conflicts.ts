import assert from 'node:assert/strict';
import express from 'express';
import { initialFarmers } from '../src/data/mockFarmers';
import { createAuthConfig } from '../src/server/auth';
import { createSmartEsgpRepository } from '../src/server/smartEsgpRepository';
import { createWhatsAppRouter } from '../src/server/whatsappRoutes';
import { createWhatsAppCloudApiConfig } from '../src/services/whatsappCloudApi';
import { createWhatsAppMediaStorageConfig } from '../src/services/whatsappMediaStorage';

const farmer = initialFarmers[0];

const webhookBody = (fromPhone: string, providerMessageId: string, text: string) => JSON.stringify({
  entry: [
    {
      changes: [
        {
          value: {
            messages: [
              {
                from: fromPhone,
                id: providerMessageId,
                timestamp: '1784791000',
                type: 'text',
                text: { body: text },
              },
            ],
          },
        },
      ],
    },
  ],
});

const repository = createSmartEsgpRepository(initialFarmers);
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
  retainRawPayloads: false,
  serviceName: 'whatsapp',
}));

const server = app.listen(0);
const address = server.address();
assert(address && typeof address === 'object', 'Expected identity conflict smoke server to bind to a port.');
const base = `http://127.0.0.1:${address.port}`;

const postText = async (fromPhone: string, providerMessageId: string, text: string) => {
  const response = await fetch(`${base}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: webhookBody(fromPhone, providerMessageId, text),
  });

  assert.equal(response.status, 200);
  return response.json() as Promise<{ processedCount: number; replyCount: number }>;
};

try {
  await postText('60127770001', 'identity-ok-1', 'BM');
  await postText('60127770001', 'identity-ok-2', 'SAYA SETUJU');
  await postText('60127770001', 'identity-ok-3', farmer.mpobLicence);

  // A licence alone only raises a FELDA review request; simulate the officer's approval.
  const pendingSession = await repository.getWhatsAppSession('60127770001');
  assert.equal(pendingSession?.identityConflict?.type, 'first_link_review');
  assert.equal(pendingSession?.farmerId, undefined);
  await repository.upsertWhatsAppSession({
    ...pendingSession!,
    farmerId: farmer.id,
    identityStatus: 'linked',
    identityConflict: { ...pendingSession!.identityConflict!, status: 'resolved', resolution: 'approved' },
    step: 'awaiting_location',
  });

  const linkedSession = await repository.getWhatsAppSession('60127770001');
  assert.equal(linkedSession?.farmerId, farmer.id);
  assert.equal(linkedSession?.identityStatus, 'linked');

  await postText('60127770002', 'identity-conflict-1', 'BM');
  await postText('60127770002', 'identity-conflict-2', 'SAYA SETUJU');
  await postText('60127770002', 'identity-conflict-3', farmer.mpobLicence);

  const conflictedSession = await repository.getWhatsAppSession('60127770002');
  assert.equal(conflictedSession?.farmerId, undefined);
  assert.equal(conflictedSession?.identityStatus, 'conflict');
  assert.equal(conflictedSession?.identityConflict?.type, 'farmer_linked_to_different_phone');
  assert.equal(conflictedSession?.identityConflict?.requestedFarmerId, farmer.id);
  assert.equal(conflictedSession?.identityConflict?.existingPhoneNumber, '60127770001');

  const [conflictEvent] = (await repository.listSystemAuditEvents(10, {
    action: 'whatsapp.identity.conflict',
  })).filter((event) => event.metadata?.conflictType === 'farmer_linked_to_different_phone');
  assert.equal(conflictEvent?.severity, 'warning');
  assert.equal(conflictEvent?.metadata?.conflictType, 'farmer_linked_to_different_phone');
  assert.equal(conflictEvent?.metadata?.requestedFarmerId, farmer.id);
  assert.equal(conflictEvent?.metadata?.existingPhone, 'wa-****0001');

  const [monitoringEvent] = await repository.listWhatsAppEvents(1);
  assert.equal(monitoringEvent.reply.requiresHumanReview, true);
  assert.equal(monitoringEvent.session?.identityStatus, 'conflict');
  assert.equal(monitoringEvent.session?.farmerId, undefined);

  console.log(JSON.stringify({
    ok: true,
    linkedPhone: linkedSession?.phoneNumber,
    conflictedPhone: conflictedSession?.phoneNumber,
    conflictType: conflictedSession?.identityConflict?.type,
    auditAction: conflictEvent?.action,
  }, null, 2));
} finally {
  server.close();
}
