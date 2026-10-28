import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 3065;
const auditorToken = 'auditor-secret';
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
    WHATSAPP_APP_SECRET: '',
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/whatsapp-identity-conflict-resolution-smoke-${Date.now()}.json`,
  },
  stdio: 'ignore',
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForServer = async () => {
  for (let i = 0; i < 30; i += 1) {
    try {
      await fetch(`${base}/api/auth/status`);
      return;
    } catch {
      await sleep(400);
    }
  }

  throw new Error('Server did not start.');
};

const webhookBody = (message) => JSON.stringify({
  entry: [{ changes: [{ value: { messages: [message] } }] }],
});

const postWebhook = async (message) => {
  const response = await fetch(`${base}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: webhookBody(message),
  });

  assert.equal(response.status, 200, `Webhook message ${message.id} failed with ${response.status}`);
  return response.json();
};

const textMessage = (fromPhone, id, text) => ({
  from: fromPhone,
  id,
  timestamp: '1784790000',
  type: 'text',
  text: { body: text },
});

const onboard = async (fromPhone, idPrefix, mpobLicence) => {
  await postWebhook(textMessage(fromPhone, `${idPrefix}-1`, 'EN'));
  await postWebhook(textMessage(fromPhone, `${idPrefix}-2`, 'I AGREE'));
  await postWebhook(textMessage(fromPhone, `${idPrefix}-3`, mpobLicence));
};

const getSession = async (phoneNumber, token = auditorToken) => {
  const response = await fetch(`${base}/api/whatsapp/sessions`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  assert.equal(response.status, 200, `Sessions list failed with ${response.status}`);
  const data = await response.json();
  return data.sessions.find((session) => session.phoneNumber === phoneNumber);
};

const latestReplyText = async (phoneNumber) => {
  const response = await fetch(`${base}/api/whatsapp/events?limit=50`, {
    headers: { authorization: `Bearer ${auditorToken}` },
  });
  assert.equal(response.status, 200, `Events list failed with ${response.status}`);
  const { events } = await response.json();
  return events.find((event) => event.inbound.fromPhone === phoneNumber)?.reply?.text;
};

const resolveConflict = (phoneNumber, body, token = auditorToken) => {
  return fetch(`${base}/api/whatsapp/sessions/${encodeURIComponent(phoneNumber)}/identity-conflict`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
};

try {
  await waitForServer();

  // --- First link: a licence alone never links the phone, and the reply does not reveal whose licence it is.
  await onboard('60127770101', 'rej-a', '500189'); // farmer f-1 (Siti binti Rahman), unclaimed
  const firstLinkPending = await getSession('60127770101');
  assert.equal(firstLinkPending?.identityStatus, 'conflict');
  assert.equal(firstLinkPending?.farmerId, undefined);
  assert.equal(firstLinkPending?.identityConflict?.type, 'first_link_review');
  assert.equal(firstLinkPending?.identityConflict?.requestedFarmerId, 'f-1');
  const firstLinkReply = await latestReplyText('60127770101');
  assert.ok(firstLinkReply?.includes('FELDA'), `Expected a FELDA review reply, got: ${firstLinkReply}`);
  assert.ok(!firstLinkReply.includes('Siti'), 'First-link reply must not reveal the farmer name.');

  // While the request is pending, another licence must not replace it.
  await postWebhook(textMessage('60127770101', 'rej-a-swap', '500433'));
  const stillPending = await getSession('60127770101');
  assert.equal(stillPending?.identityConflict?.requestedFarmerId, 'f-1');

  const firstLinkApproval = await resolveConflict('60127770101', { decision: 'approve' });
  assert.equal(firstLinkApproval.status, 200, `First-link approval failed with ${firstLinkApproval.status}`);
  const firstLinked = await getSession('60127770101');
  assert.equal(firstLinked?.farmerId, 'f-1');
  assert.equal(firstLinked?.identityStatus, 'linked');
  assert.equal(firstLinked?.step, 'awaiting_location');

  // --- Reject path: phone B tries to claim phone A's already-linked farmer, gets rejected, then recovers with its own licence.
  await onboard('60127770102', 'rej-b', '500189'); // conflict: farmer f-1 already linked to 60127770101

  const conflictedBefore = await getSession('60127770102');
  assert.equal(conflictedBefore?.identityStatus, 'conflict');
  assert.equal(conflictedBefore?.identityConflict?.status, 'open');
  assert.equal(conflictedBefore?.identityConflict?.type, 'farmer_linked_to_different_phone');
  assert.equal(conflictedBefore?.identityConflict?.requestedFarmerId, 'f-1');

  const unauthedAttempt = await resolveConflict('60127770102', { decision: 'reject' }, null);
  assert.equal(unauthedAttempt.status, 401, `Expected 401 without a token, got ${unauthedAttempt.status}`);

  const viewerOnlyAttempt = await resolveConflict('60127770102', { decision: 'reject' }, 'not-a-real-token');
  assert.equal(viewerOnlyAttempt.status, 401, `Expected 401 for an invalid token, got ${viewerOnlyAttempt.status}`);

  const badDecision = await resolveConflict('60127770102', { decision: 'maybe' });
  assert.equal(badDecision.status, 400, `Expected 400 for an invalid decision, got ${badDecision.status}`);

  const rejectResponse = await resolveConflict('60127770102', { decision: 'reject', reviewedBy: 'Smoke Auditor', notes: 'Could not verify caller.' });
  assert.equal(rejectResponse.status, 200, `Reject call failed with ${rejectResponse.status}`);
  const rejectData = await rejectResponse.json();
  assert.equal(rejectData.session.identityStatus, 'unlinked');
  assert.equal(rejectData.session.step, 'mpob');
  assert.equal(rejectData.session.identityConflict.status, 'resolved');
  assert.equal(rejectData.session.identityConflict.resolution, 'rejected');
  assert.equal(rejectData.farmer, undefined);

  const holderUntouched = await getSession('60127770101');
  assert.equal(holderUntouched?.farmerId, 'f-1');
  assert.equal(holderUntouched?.identityStatus, 'linked');

  const doubleReject = await resolveConflict('60127770102', { decision: 'reject' });
  assert.equal(doubleReject.status, 404, `Expected 404 resolving an already-resolved conflict, got ${doubleReject.status}`);

  const noConflict = await resolveConflict('60127770101', { decision: 'reject' });
  assert.equal(noConflict.status, 404, `Expected 404 resolving a phone with no conflict, got ${noConflict.status}`);

  // Rejected phone should be able to recover by onboarding its own farmer, once FELDA approves it.
  await postWebhook(textMessage('60127770102', 'rej-b-retry', '500247')); // farmer f-2, unclaimed
  const recoveryPending = await getSession('60127770102');
  assert.equal(recoveryPending?.identityConflict?.type, 'first_link_review');
  assert.equal((await resolveConflict('60127770102', { decision: 'approve' })).status, 200);
  const recoveredSession = await getSession('60127770102');
  assert.equal(recoveredSession?.identityStatus, 'linked');
  assert.equal(recoveredSession?.farmerId, 'f-2');
  assert.equal(recoveredSession?.step, 'awaiting_location');

  // --- Approve path: phone C claims farmer f-2, now held by phone B. Approval should transfer the link.
  await onboard('60127770103', 'app-c', '500247'); // conflict: f-2 already linked to 60127770102

  const conflictC = await getSession('60127770103');
  assert.equal(conflictC?.identityStatus, 'conflict');
  assert.equal(conflictC?.identityConflict?.type, 'farmer_linked_to_different_phone');
  assert.equal(conflictC?.identityConflict?.existingPhoneNumber, '60127770102');

  const approveResponse = await resolveConflict('60127770103', { decision: 'approve', reviewedBy: 'Smoke Auditor', notes: 'Farmer confirmed new phone by call.' });
  assert.equal(approveResponse.status, 200, `Approve call failed with ${approveResponse.status}`);
  const approveData = await approveResponse.json();
  assert.equal(approveData.session.identityStatus, 'linked');
  assert.equal(approveData.session.farmerId, 'f-2');
  assert.equal(approveData.session.step, 'awaiting_location');
  assert.equal(approveData.session.identityConflict.resolution, 'approved');
  assert.equal(approveData.farmer?.id, 'f-2');
  assert.ok(
    approveData.farmer.auditLogs[0].details.includes('wa-****0103') && approveData.farmer.auditLogs[0].details.includes('wa-****0102'),
    'Expected the farmer audit log to reference both masked phone numbers.'
  );

  const transferredAway = await getSession('60127770102');
  assert.equal(transferredAway?.farmerId, undefined);
  assert.equal(transferredAway?.identityStatus, 'unlinked');
  assert.equal(transferredAway?.step, 'mpob');

  const newHolder = await getSession('60127770103');
  assert.equal(newHolder?.farmerId, 'f-2');
  assert.equal(newHolder?.identityStatus, 'linked');

  // --- Double-link guard: two phones request the same unclaimed farmer; only the first approval may link.
  await onboard('60127770104', 'dup-d', '500678'); // farmer f-3
  await onboard('60127770105', 'dup-e', '500678'); // also farmer f-3, before D is approved
  assert.equal((await resolveConflict('60127770104', { decision: 'approve' })).status, 200);
  const secondApproval = await resolveConflict('60127770105', { decision: 'approve' });
  assert.equal(secondApproval.status, 409, `Expected 409 approving a second phone for f-3, got ${secondApproval.status}`);
  assert.equal((await getSession('60127770105'))?.farmerId, undefined);

  // --- Attempt limit: five wrong licences lock the phone out, even for a correct licence afterwards.
  await postWebhook(textMessage('60127770106', 'lock-f-1', 'EN'));
  await postWebhook(textMessage('60127770106', 'lock-f-2', 'I AGREE'));
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await postWebhook(textMessage('60127770106', `lock-f-wrong-${attempt}`, `40000${attempt}`));
  }
  const lockedSession = await getSession('60127770106');
  assert.ok(lockedSession?.mpobLockedUntil && Date.parse(lockedSession.mpobLockedUntil) > Date.now(), 'Expected an MPOB lockout.');
  await postWebhook(textMessage('60127770106', 'lock-f-valid', '500562')); // farmer f-4, valid but locked out
  const afterLockout = await getSession('60127770106');
  assert.equal(afterLockout?.identityConflict, undefined, 'A locked-out phone must not raise a link request.');
  assert.ok((await latestReplyText('60127770106'))?.includes('30 minutes'));

  console.log(JSON.stringify({
    ok: true,
    rejectedThenRecoveredAs: recoveredSession.farmerId,
    approvedTransferFrom: '60127770102',
    approvedTransferTo: newHolder.phoneNumber,
    approvedFarmer: newHolder.farmerId,
  }, null, 2));
} finally {
  child.kill();
}
