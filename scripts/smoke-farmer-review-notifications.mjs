import { spawn } from 'node:child_process';

// Checks that FELDA dashboard decisions (evidence review, certificate issue)
// message the farmer's linked WhatsApp number, and skip when nothing changed.
const port = 3093;
const base = `http://localhost:${port}`;
const phone = '60127770456';
const auditorToken = 'auditor-secret';
const stamp = Date.now();

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
    WHATSAPP_APP_SECRET: '',
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/review-notifications-smoke-${stamp}.json`,
    SMART_ESGP_MEDIA_DIR: `.smart-esgp-media/review-notifications-smoke-${stamp}`,
  },
  stdio: 'ignore',
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const authHeaders = { 'content-type': 'application/json', authorization: `Bearer ${auditorToken}` };

const waitForServer = async () => {
  for (let i = 0; i < 30; i += 1) {
    try {
      await fetch(`${base}/api/auth/status`);
      return;
    } catch {
      await sleep(400);
    }
  }

  throw new Error('Review notification smoke service did not start.');
};

const postWebhook = async (message) => {
  const response = await fetch(`${base}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ entry: [{ changes: [{ value: { messages: [message] } }] }] }),
  });

  if (response.status !== 200) {
    throw new Error(`Webhook message ${message.id} failed with ${response.status}`);
  }
};

const text = (id, body) => ({ from: phone, id, timestamp: String(1784790000 + Number(id.split('-').pop())), type: 'text', text: { body } });

const review = async (evidenceId, decision, notes) => {
  const response = await fetch(`${base}/api/evidence/${evidenceId}/review`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ decision, notes }),
  });

  if (response.status !== 200) {
    throw new Error(`Review ${decision} failed with ${response.status}`);
  }

  return response.json();
};

const expectNotified = (result, expectedMode, label) => {
  if (result.farmerNotified?.mode !== expectedMode) {
    throw new Error(`${label}: expected farmerNotified.mode=${expectedMode}, got ${JSON.stringify(result.farmerNotified)}`);
  }
};

try {
  await waitForServer();

  await postWebhook(text('notify-wa-1', 'EN'));
  await postWebhook(text('notify-wa-2', 'I AGREE'));
  await postWebhook(text('notify-wa-3', '500189'));
  const linkApproval = await fetch(`${base}/api/whatsapp/sessions/${phone}/identity-conflict`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ decision: 'approve' }),
  });
  if (linkApproval.status !== 200) {
    throw new Error(`First-link approval failed with ${linkApproval.status}`);
  }
  await postWebhook({
    from: phone,
    id: 'notify-wa-4',
    timestamp: '1784790004',
    type: 'location',
    location: { latitude: 2.035, longitude: 103.328 },
  });
  await postWebhook({
    from: phone,
    id: 'notify-wa-5',
    timestamp: '1784790005',
    type: 'image',
    image: { id: 'media-notify-smoke', mime_type: 'image/jpeg', caption: 'harvest' },
  });

  const evidenceResponse = await fetch(`${base}/api/evidence?limit=20`, { headers: authHeaders });
  const evidenceRecord = (await evidenceResponse.json()).evidence?.find((record) => record.providerMessageId === 'notify-wa-5');
  if (!evidenceRecord) {
    throw new Error('Expected the simulated photo to create an evidence record.');
  }

  expectNotified(await review(evidenceRecord.id, 'rejected', 'Photo is too blurry.'), 'dry_run', 'reject');
  expectNotified(await review(evidenceRecord.id, 'rejected', 'Photo is too blurry, please retake.'), 'skipped', 'repeat reject');
  expectNotified(await review(evidenceRecord.id, 'flagged', 'Please send a boundary photo.'), 'dry_run', 'flag');
  expectNotified(await review(evidenceRecord.id, 'pending'), 'skipped', 'reset to pending');
  expectNotified(await review(evidenceRecord.id, 'approved'), 'dry_run', 'approve');

  const auditResponse = await fetch(`${base}/api/audit/events?action=evidence.review.approved&limit=5`, { headers: authHeaders });
  const auditEvent = (await auditResponse.json()).events?.find((event) => event.entityId === evidenceRecord.id);
  if (auditEvent?.metadata?.farmerNotifiedMode !== 'dry_run') {
    throw new Error(`Expected audit event to record farmerNotifiedMode, got ${JSON.stringify(auditEvent?.metadata)}`);
  }

  const issueResponse = await fetch(`${base}/api/certificates/issue`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ farmerId: evidenceRecord.farmerId }),
  });
  const issueResult = await issueResponse.json();
  if (issueResponse.status === 201) {
    expectNotified(issueResult, 'dry_run', 'certificate issue');
  } else if (!(issueResponse.status === 200 && issueResult.reused) && issueResponse.status !== 409) {
    throw new Error(`Unexpected certificate issue response ${issueResponse.status}: ${JSON.stringify(issueResult)}`);
  }

  console.log(`Farmer review notification smoke passed (certificate issue: HTTP ${issueResponse.status}).`);
} finally {
  child.kill();
}
