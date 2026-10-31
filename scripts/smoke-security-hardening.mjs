import { spawn } from 'node:child_process';

// Checks the audit hardening: named API users and attribution, protected
// compliance fields, justified review actions, CSP, unsigned-webhook rejection
// for relayed requests, constant-time verify token, and failed-auth lockout.
const port = 3096;
const base = `http://localhost:${port}`;
const stamp = Date.now();
const auditorToken = 'aisyah-token-0123456789abcdef';
const viewerToken = 'ben-token-0123456789abcdef';
const verifyToken = 'verify-token-for-hardening-smoke';

const child = spawn(process.execPath, ['dist/server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    SMART_ESGP_API_USERS: `aisyah:auditor:${auditorToken},ben:viewer:${viewerToken}`,
    SMART_ESGP_VIEWER_TOKEN: '',
    SMART_ESGP_DEALER_TOKEN: '',
    SMART_ESGP_AUDITOR_TOKEN: '',
    FELDA_API_TOKEN: '',
    SMART_ESGP_DASHBOARD_ENABLE_WHATSAPP_WEBHOOK: 'true',
    SMART_ESGP_AUTH_FAILURE_LIMIT_PER_MINUTE: '5',
    WHATSAPP_VERIFY_TOKEN: verifyToken,
    WHATSAPP_APP_SECRET: '',
    WHATSAPP_ACCESS_TOKEN: '',
    WHATSAPP_PHONE_NUMBER_ID: '',
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/security-hardening-smoke-${stamp}.json`,
  },
  stdio: 'ignore',
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const as = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });

const waitForServer = async () => {
  for (let i = 0; i < 30; i += 1) {
    try {
      await fetch(`${base}/health`);
      return;
    } catch {
      await sleep(400);
    }
  }

  throw new Error('Security hardening smoke service did not start.');
};

const expect = (label, actual, expected) => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

try {
  await waitForServer();
  const results = {};

  const health = await fetch(`${base}/health`);
  const csp = health.headers.get('content-security-policy') || '';
  expect('CSP frame-ancestors', csp.includes("frame-ancestors 'none'"), true);
  expect('CSP blocks inline scripts in production build', /script-src 'self'(;|$)/.test(csp), true);
  results.csp = 'present';

  const farmerResponse = await fetch(`${base}/api/farmers/f-1`, { headers: as(viewerToken) });
  expect('viewer reads farmer', farmerResponse.status, 200);
  const { farmer } = await farmerResponse.json();

  const forgedStatus = farmer.status === 'Certified' ? 'Flagged' : 'Certified';
  const putResponse = await fetch(`${base}/api/farmers/f-1`, {
    method: 'PUT',
    headers: as(auditorToken),
    body: JSON.stringify({ ...farmer, status: forgedStatus, score: farmer.score === 100 ? 1 : 100, daysCollected: 365, plotLocation: 'Edited by smoke' }),
  });
  const putResult = await putResponse.json();
  expect('PUT status', putResponse.status, 200);
  expect('PUT keeps status', putResult.farmer.status, farmer.status);
  expect('PUT keeps score', putResult.farmer.score, farmer.score);
  expect('PUT keeps daysCollected', putResult.farmer.daysCollected, farmer.daysCollected);
  expect('PUT applies editable field', putResult.farmer.plotLocation, 'Edited by smoke');
  expect('PUT reports ignored fields', putResult.ignoredProtectedFields.includes('status'), true);
  results.protectedFields = putResult.ignoredProtectedFields;

  const viewerAction = await fetch(`${base}/api/farmers/f-1/review-actions`, {
    method: 'POST',
    headers: as(viewerToken),
    body: JSON.stringify({ action: 'clear_flag', justification: 'Viewer should not do this' }),
  });
  expect('viewer review action', viewerAction.status, 403);

  const noReason = await fetch(`${base}/api/farmers/f-1/review-actions`, {
    method: 'POST',
    headers: as(auditorToken),
    body: JSON.stringify({ action: 'rule_exception' }),
  });
  expect('review action without justification', noReason.status, 400);

  const actionResponse = await fetch(`${base}/api/farmers/f-1/review-actions`, {
    method: 'POST',
    headers: as(auditorToken),
    body: JSON.stringify({ action: 'clear_flag', justification: 'Boundary photos checked on site.' }),
  });
  const actionResult = await actionResponse.json();
  expect('review action', actionResponse.status, 200);
  expect('review action status follows evidence days', actionResult.farmer.status, farmer.daysCollected >= 90 ? 'Certified' : 'In progress');
  expect('review action audit log names the user', actionResult.farmer.auditLogs[0].user, 'aisyah');

  const auditResponse = await fetch(`${base}/api/audit/events?action=farmer.flag_cleared&limit=5`, { headers: as(viewerToken) });
  const auditEvent = (await auditResponse.json()).events?.[0];
  expect('audit event actor', auditEvent?.actorId, 'aisyah');
  results.attribution = auditEvent.actorId;

  const webhookBody = JSON.stringify({ entry: [] });
  const relayedWebhook = await fetch(`${base}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: webhookBody,
  });
  expect('unsigned relayed webhook', relayedWebhook.status, 401);
  const localWebhook = await fetch(`${base}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: webhookBody,
  });
  expect('unsigned local webhook', localWebhook.status, 200);

  const verifyQuery = (token) => `${base}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=12345`;
  expect('wrong verify token', (await fetch(verifyQuery('wrong'))).status, 403);
  const goodVerify = await fetch(verifyQuery(verifyToken));
  expect('right verify token', await goodVerify.text(), '12345');

  for (let i = 0; i < 5; i += 1) {
    expect(`wrong token attempt ${i + 1}`, (await fetch(`${base}/api/farmers`, { headers: as(`wrong-token-${i}`) })).status, 401);
  }
  expect('locked out after failures', (await fetch(`${base}/api/farmers`, { headers: as('wrong-token-final') })).status, 429);
  expect('no-token request still gets 401', (await fetch(`${base}/api/farmers`)).status, 401);
  results.lockout = 429;

  console.log(JSON.stringify({ ok: true, ...results }, null, 2));
} finally {
  child.kill();
}
