import { spawn } from 'node:child_process';

const port = 3072;
const auditorToken = 'auditor-secret';
const phone = '60128880123';
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
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/consent-records-smoke-${Date.now()}.json`,
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
};

const authHeaders = {
  authorization: `Bearer ${auditorToken}`,
};

try {
  await waitForServer();

  await postWebhook({
    from: phone,
    id: 'consent-wa-1',
    timestamp: '1784789000',
    type: 'text',
    text: { body: 'EN' },
  });
  await postWebhook({
    from: phone,
    id: 'consent-wa-2',
    timestamp: '1784789001',
    type: 'text',
    text: { body: 'I AGREE' },
  });

  const phoneConsentResponse = await fetch(`${base}/api/consents?phoneNumber=${phone}`, {
    headers: authHeaders,
  });
  if (phoneConsentResponse.status !== 200) {
    throw new Error(`Phone consent lookup failed with ${phoneConsentResponse.status}`);
  }

  const phoneConsents = (await phoneConsentResponse.json()).consents || [];
  if (phoneConsents.length !== 1) {
    throw new Error(`Expected one phone consent before MPOB link, got ${phoneConsents.length}`);
  }
  if (phoneConsents[0].farmerId) {
    throw new Error('Consent should not be linked to a farmer before MPOB step.');
  }
  if (phoneConsents[0].language !== 'EN' || phoneConsents[0].responseText !== 'I AGREE') {
    throw new Error('Consent language or response text was not recorded correctly.');
  }
  if (!phoneConsents[0].consentText.includes('Smart-ESGP will collect')) {
    throw new Error('Consent notice text was not persisted.');
  }

  await postWebhook({
    from: phone,
    id: 'consent-wa-3',
    timestamp: '1784789002',
    type: 'text',
    text: { body: '500678' },
  });
  // A licence alone no longer links the phone; approve the link as a FELDA officer would.
  const linkApproval = await fetch(`${base}/api/whatsapp/sessions/${phone}/identity-conflict`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${auditorToken}` },
    body: JSON.stringify({ decision: 'approve' }),
  });
  if (linkApproval.status !== 200) {
    throw new Error(`First-link approval failed with ${linkApproval.status}`);
  }

  const farmerConsentResponse = await fetch(`${base}/api/consents?farmerId=f-3`, {
    headers: authHeaders,
  });
  if (farmerConsentResponse.status !== 200) {
    throw new Error(`Farmer consent lookup failed with ${farmerConsentResponse.status}`);
  }

  const farmerConsents = (await farmerConsentResponse.json()).consents || [];
  if (farmerConsents.length !== 1 || farmerConsents[0].farmerId !== 'f-3') {
    throw new Error(`Expected linked farmer consent for f-3, got ${JSON.stringify(farmerConsents)}`);
  }

  const auditResponse = await fetch(`${base}/api/audit/events?limit=50`, {
    headers: authHeaders,
  });
  const auditEvents = (await auditResponse.json()).events || [];
  const actions = new Set(auditEvents.map((event) => event.action));
  if (!actions.has('consent.recorded') || !actions.has('consent.linked')) {
    throw new Error('Expected consent audit events to be recorded.');
  }

  console.log(JSON.stringify({
    ok: true,
    phoneConsentCount: phoneConsents.length,
    farmerConsentCount: farmerConsents.length,
    farmerId: farmerConsents[0].farmerId,
  }, null, 2));
} finally {
  child.kill();
}
