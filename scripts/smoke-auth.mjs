import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const port = 3062;
const viewerToken = 'viewer-secret';
const auditorToken = 'auditor-secret';
const whatsappAppSecret = 'wa-app-secret';
const base = `http://localhost:${port}`;

const child = spawn(process.execPath, ['dist/server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    SMART_ESGP_REQUIRE_AUTH: 'true',
    SMART_ESGP_DASHBOARD_ENABLE_WHATSAPP_WEBHOOK: 'true',
    SMART_ESGP_VIEWER_TOKEN: viewerToken,
    SMART_ESGP_AUDITOR_TOKEN: auditorToken,
    WHATSAPP_APP_SECRET: whatsappAppSecret,
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/auth-smoke-${Date.now()}.json`,
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

const expectStatus = async (label, response, expectedStatus) => {
  if (response.status !== expectedStatus) {
    throw new Error(`${label}: expected ${expectedStatus}, got ${response.status}`);
  }
};

try {
  await waitForServer();

  const noToken = await fetch(`${base}/api/farmers`);
  await expectStatus('no-token read', noToken, 401);

  const viewerRead = await fetch(`${base}/api/farmers`, {
    headers: { authorization: `Bearer ${viewerToken}` },
  });
  await expectStatus('viewer read', viewerRead, 200);
  const farmer = (await viewerRead.json()).farmers[0];

  const noTokenFarmerWhatsappEvents = await fetch(`${base}/api/whatsapp/farmers/${farmer.id}/events`);
  await expectStatus('no-token farmer WhatsApp events', noTokenFarmerWhatsappEvents, 401);

  const viewerFarmerWhatsappEvents = await fetch(`${base}/api/whatsapp/farmers/${farmer.id}/events`, {
    headers: { authorization: `Bearer ${viewerToken}` },
  });
  await expectStatus('viewer farmer WhatsApp events', viewerFarmerWhatsappEvents, 200);

  const noTokenWhatsappClaims = await fetch(`${base}/api/whatsapp/message-claims`);
  await expectStatus('no-token WhatsApp message claims', noTokenWhatsappClaims, 401);

  const viewerWhatsappClaims = await fetch(`${base}/api/whatsapp/message-claims`, {
    headers: { authorization: `Bearer ${viewerToken}` },
  });
  await expectStatus('viewer WhatsApp message claims', viewerWhatsappClaims, 200);

  const viewerWrite = await fetch(`${base}/api/farmers/${farmer.id}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${viewerToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(farmer),
  });
  await expectStatus('viewer write', viewerWrite, 403);

  const auditorWrite = await fetch(`${base}/api/farmers/${farmer.id}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${auditorToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(farmer),
  });
  await expectStatus('auditor write', auditorWrite, 200);

  const webhookBody = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: '60120000000',
                  id: 'auth-wa-1',
                  timestamp: '1784789000',
                  type: 'text',
                  text: { body: 'BM' },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const unsignedWebhook = await fetch(`${base}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: webhookBody,
  });
  await expectStatus('unsigned webhook', unsignedWebhook, 401);

  const signature = `sha256=${crypto
    .createHmac('sha256', whatsappAppSecret)
    .update(Buffer.from(webhookBody))
    .digest('hex')}`;

  const signedWebhook = await fetch(`${base}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signature,
    },
    body: webhookBody,
  });
  await expectStatus('signed webhook', signedWebhook, 200);

  console.log(JSON.stringify({
    ok: true,
    noToken: noToken.status,
    viewerRead: viewerRead.status,
    noTokenFarmerWhatsappEvents: noTokenFarmerWhatsappEvents.status,
    viewerFarmerWhatsappEvents: viewerFarmerWhatsappEvents.status,
    noTokenWhatsappClaims: noTokenWhatsappClaims.status,
    viewerWhatsappClaims: viewerWhatsappClaims.status,
    viewerWrite: viewerWrite.status,
    auditorWrite: auditorWrite.status,
    unsignedWebhook: unsignedWebhook.status,
    signedWebhook: signedWebhook.status,
  }, null, 2));
} finally {
  child.kill();
}
