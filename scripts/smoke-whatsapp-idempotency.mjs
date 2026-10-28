import { spawn } from 'node:child_process';

const port = 3078;
const auditorToken = 'auditor-secret';
const phone = '60128881234';
const base = `http://localhost:${port}`;

const child = spawn(process.execPath, ['dist/server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    SMART_ESGP_REQUIRE_AUTH: 'true',
    SMART_ESGP_DASHBOARD_ENABLE_WHATSAPP_WEBHOOK: 'true',
    SMART_ESGP_AUDITOR_TOKEN: auditorToken,
    WHATSAPP_ACCESS_TOKEN: '',
    WHATSAPP_PHONE_NUMBER_ID: '',
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/whatsapp-idempotency-smoke-${Date.now()}.json`,
  },
  stdio: 'ignore',
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForServer = async () => {
  for (let i = 0; i < 30; i += 1) {
    try {
      await fetch(`${base}/health`);
      return;
    } catch {
      await sleep(400);
    }
  }

  throw new Error('Server did not start.');
};

const webhookBody = (message) => JSON.stringify({
  entry: [
    {
      changes: [
        {
          value: {
            messages: [message],
          },
        },
      ],
    },
  ],
});

const postWebhook = async (message) => {
  const response = await fetch(`${base}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: webhookBody(message),
  });

  if (response.status !== 200) {
    throw new Error(`Webhook message ${message.id} failed with ${response.status}`);
  }

  return response.json();
};

const assertIgnoredWebhook = (result, label) => {
  assert(result.accepted === true, `Expected ${label} webhook to be accepted as an empty valid batch.`);
  assert(result.inboundCount === 0, `Expected ${label} webhook to have no valid inbound messages.`);
  assert(result.ignoredCount === 1, `Expected ${label} webhook to count one ignored malformed message.`);
  assert(result.claimedCount === 0, `Expected ${label} webhook not to claim message IDs.`);
  assert(result.processedCount === 0, `Expected ${label} webhook not to be processed.`);
  assert(result.duplicateCount === 0, `Expected ${label} webhook not to be treated as duplicate.`);
  assert(result.replyCount === 0, `Expected ${label} webhook not to generate a reply.`);
  assert(result.outbound?.dryRun === 0, `Expected ${label} webhook not to send a dry-run reply.`);
};

const authHeaders = {
  authorization: `Bearer ${auditorToken}`,
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

try {
  await waitForServer();

  const languageMessage = {
    from: phone,
    id: 'idempotency-wa-1',
    timestamp: '1784789000',
    type: 'text',
    text: { body: 'EN' },
  };
  const consentMessage = {
    from: phone,
    id: 'idempotency-wa-2',
    timestamp: '1784789001',
    type: 'text',
    text: { body: 'I AGREE' },
  };
  const concurrentMessage = {
    from: '60128881235',
    id: 'idempotency-wa-concurrent',
    timestamp: '1784789002',
    type: 'text',
    text: { body: 'EN' },
  };
  const missingProviderIdMessage = {
    from: phone,
    timestamp: '1784788998',
    type: 'text',
    text: { body: 'EN' },
  };
  const invalidSenderMessage = {
    from: 'not-a-phone-number',
    id: 'idempotency-invalid-sender',
    timestamp: '1784788999',
    type: 'text',
    text: { body: 'EN' },
  };

  assertIgnoredWebhook(await postWebhook(missingProviderIdMessage), 'missing provider ID');
  assertIgnoredWebhook(await postWebhook(invalidSenderMessage), 'invalid sender');

  const firstLanguage = await postWebhook(languageMessage);
  assert(firstLanguage.ignoredCount === 0, 'Expected first language message not to ignore malformed messages.');
  assert(firstLanguage.claimedCount === 1, 'Expected first language message to claim one provider message ID.');
  assert(firstLanguage.processedCount === 1, 'Expected first language message to be processed.');
  assert(firstLanguage.duplicateCount === 0, 'Expected first language message not to be duplicate.');
  assert(firstLanguage.replyCount === 1, 'Expected first language message to generate one reply.');
  assert(firstLanguage.outbound?.dryRun === 1, 'Expected first language message to dry-run one outbound reply.');
  assert(!('replies' in firstLanguage) && !('sendResults' in firstLanguage), 'Webhook response should not expose reply/send detail.');

  const duplicateLanguage = await postWebhook(languageMessage);
  assert(duplicateLanguage.claimedCount === 0, 'Expected duplicate language message not to claim provider message IDs.');
  assert(duplicateLanguage.processedCount === 0, 'Expected duplicate language message to be ignored.');
  assert(duplicateLanguage.duplicateCount === 1, 'Expected duplicate language count.');
  assert(duplicateLanguage.replyCount === 0, 'Expected duplicate language message not to generate a reply.');
  assert(duplicateLanguage.outbound?.dryRun === 0, 'Expected duplicate language message not to send a dry-run reply.');

  const firstConsent = await postWebhook(consentMessage);
  assert(firstConsent.claimedCount === 1, 'Expected first consent message to claim one provider message ID.');
  assert(firstConsent.processedCount === 1, 'Expected first consent message to be processed.');
  assert(firstConsent.duplicateCount === 0, 'Expected first consent message not to be duplicate.');
  assert(firstConsent.replyCount === 1, 'Expected first consent message to generate one reply.');

  const duplicateConsent = await postWebhook(consentMessage);
  assert(duplicateConsent.claimedCount === 0, 'Expected duplicate consent not to claim provider message IDs.');
  assert(duplicateConsent.processedCount === 0, 'Expected duplicate consent message to be ignored.');
  assert(duplicateConsent.duplicateCount === 1, 'Expected duplicate consent count.');
  assert(duplicateConsent.replyCount === 0, 'Expected duplicate consent not to generate a reply.');
  assert(duplicateConsent.outbound?.dryRun === 0, 'Expected duplicate consent not to send a dry-run reply.');

  const concurrentResults = await Promise.all([
    postWebhook(concurrentMessage),
    postWebhook(concurrentMessage),
  ]);
  const concurrentProcessed = concurrentResults.reduce((sum, result) => sum + result.processedCount, 0);
  const concurrentDuplicates = concurrentResults.reduce((sum, result) => sum + result.duplicateCount, 0);
  const concurrentReplies = concurrentResults.reduce((sum, result) => sum + result.replyCount, 0);
  const concurrentClaims = concurrentResults.reduce((sum, result) => sum + result.claimedCount, 0);
  const concurrentDryRuns = concurrentResults.reduce((sum, result) => sum + (result.outbound?.dryRun || 0), 0);
  assert(concurrentClaims === 1, `Expected concurrent duplicate deliveries to acquire one claim, got ${concurrentClaims}.`);
  assert(concurrentProcessed === 1, `Expected concurrent duplicate deliveries to process once, got ${concurrentProcessed}.`);
  assert(concurrentDuplicates === 1, `Expected concurrent duplicate deliveries to report one duplicate, got ${concurrentDuplicates}.`);
  assert(concurrentReplies === 1, `Expected concurrent duplicate deliveries to generate one reply, got ${concurrentReplies}.`);
  assert(concurrentDryRuns === 1, `Expected concurrent duplicate deliveries to send one dry-run reply, got ${concurrentDryRuns}.`);

  const eventsResponse = await fetch(`${base}/api/whatsapp/events`, {
    headers: authHeaders,
  });
  const events = (await eventsResponse.json()).events || [];
  const providerIds = events.map((event) => event.inbound?.providerMessageId);
  assert(providerIds.filter((id) => id === languageMessage.id).length === 1, 'Expected language webhook event once.');
  assert(providerIds.filter((id) => id === consentMessage.id).length === 1, 'Expected consent webhook event once.');
  assert(providerIds.filter((id) => id === concurrentMessage.id).length === 1, 'Expected concurrent webhook event once.');
  assert(!providerIds.includes('idempotency-invalid-sender'), 'Expected invalid sender webhook event not to be stored.');
  assert(!providerIds.some((id) => typeof id === 'string' && id.startsWith('wa-')), 'Expected synthetic webhook IDs not to be stored.');

  const consentsResponse = await fetch(`${base}/api/consents?phoneNumber=${phone}`, {
    headers: authHeaders,
  });
  const consents = (await consentsResponse.json()).consents || [];
  assert(consents.length === 1, `Expected one consent record, got ${consents.length}.`);

  const auditResponse = await fetch(`${base}/api/audit/events?limit=100`, {
    headers: authHeaders,
  });
  const auditEvents = (await auditResponse.json()).events || [];
  const duplicateAuditCount = auditEvents.filter((event) => event.action === 'whatsapp.webhook.duplicate_ignored').length;
  assert(duplicateAuditCount >= 2, 'Expected duplicate ignored audit events.');

  const claimsResponse = await fetch(`${base}/api/whatsapp/message-claims?limit=25`, {
    headers: authHeaders,
  });
  const claims = (await claimsResponse.json()).claims || [];
  const concurrentClaim = claims.find((claim) => claim.providerMessageId === concurrentMessage.id);
  assert(concurrentClaim?.status === 'processed', 'Expected concurrent message claim to be marked processed.');
  assert(concurrentClaim?.duplicateCount === 1, `Expected concurrent message claim duplicate count 1, got ${concurrentClaim?.duplicateCount}.`);

  console.log(JSON.stringify({
    ok: true,
    firstProcessed: firstLanguage.processedCount + firstConsent.processedCount + concurrentProcessed,
    duplicateIgnored: duplicateLanguage.duplicateCount + duplicateConsent.duplicateCount + concurrentDuplicates,
    consentCount: consents.length,
    concurrentDuplicateCount: concurrentClaim.duplicateCount,
    storedWebhookEvents: events.length,
  }, null, 2));
} finally {
  child.kill();
}
