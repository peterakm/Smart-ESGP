import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const port = 3065;
const auditorToken = 'auditor-secret';
const whatsappVerifyToken = 'standalone-wa-verify-token';
const whatsappAppSecret = 'standalone-wa-app-secret';
const base = `http://localhost:${port}`;

const child = spawn(process.execPath, ['dist/whatsapp-server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    SMART_ESGP_REQUIRE_AUTH: 'true',
    SMART_ESGP_AUDITOR_TOKEN: auditorToken,
    WHATSAPP_VERIFY_TOKEN: whatsappVerifyToken,
    WHATSAPP_APP_SECRET: whatsappAppSecret,
    WHATSAPP_ACCESS_TOKEN: '',
    WHATSAPP_PHONE_NUMBER_ID: '',
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/whatsapp-service-smoke-${Date.now()}.json`,
  },
  stdio: 'ignore',
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForServer = async () => {
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.status === 200) {
        return;
      }
    } catch {
      await sleep(400);
    }
  }

  throw new Error('WhatsApp service did not start.');
};

try {
  await waitForServer();

  const healthResponse = await fetch(`${base}/health`);
  const health = await healthResponse.json();
  if (health.service !== 'smart-esgp-whatsapp-chatbot' || health.mode !== 'dry_run') {
    throw new Error(`Unexpected health response: ${JSON.stringify(health)}`);
  }

  const dashboardRoute = await fetch(`${base}/api/farmers`, {
    headers: { authorization: `Bearer ${auditorToken}` },
  });
  if (dashboardRoute.status !== 404) {
    throw new Error(`Standalone WhatsApp service should not expose /api/farmers, got ${dashboardRoute.status}`);
  }

  const verifyChallenge = 'standalone-challenge';
  const verifyResponse = await fetch(
    `${base}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(whatsappVerifyToken)}&hub.challenge=${encodeURIComponent(verifyChallenge)}`
  );
  if (verifyResponse.status !== 200 || await verifyResponse.text() !== verifyChallenge) {
    throw new Error(`Standalone webhook verification handshake failed with ${verifyResponse.status}`);
  }

  const rejectedVerifyResponse = await fetch(
    `${base}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=${encodeURIComponent(verifyChallenge)}`
  );
  if (rejectedVerifyResponse.status !== 403) {
    throw new Error(`Standalone webhook verification should reject wrong token, got ${rejectedVerifyResponse.status}`);
  }

  const webhookBody = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: '60129990000',
                  id: 'standalone-wa-1',
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

  const unsignedWebhookResponse = await fetch(`${base}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: webhookBody,
  });
  if (unsignedWebhookResponse.status !== 401) {
    throw new Error(`Standalone webhook should reject unsigned payloads, got ${unsignedWebhookResponse.status}`);
  }

  const invalidSignatureWebhookResponse = await fetch(`${base}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': 'sha256=invalid',
    },
    body: webhookBody,
  });
  if (invalidSignatureWebhookResponse.status !== 401) {
    throw new Error(`Standalone webhook should reject invalid signatures, got ${invalidSignatureWebhookResponse.status}`);
  }

  const signature = `sha256=${crypto
    .createHmac('sha256', whatsappAppSecret)
    .update(Buffer.from(webhookBody))
    .digest('hex')}`;

  const webhookResponse = await fetch(`${base}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signature,
    },
    body: webhookBody,
  });

  if (webhookResponse.status !== 200) {
    throw new Error(`Standalone webhook failed with ${webhookResponse.status}`);
  }

  const webhookData = await webhookResponse.json();
  if (webhookData.outbound?.dryRun !== 1) {
    throw new Error(`Expected one dry-run webhook send summary, got ${JSON.stringify(webhookData)}`);
  }
  if ('replies' in webhookData || 'sendResults' in webhookData) {
    throw new Error(`Webhook response should not expose reply/send detail: ${JSON.stringify(webhookData)}`);
  }

  const monitoringRoute = await fetch(`${base}/api/whatsapp/events`, {
    headers: { authorization: `Bearer ${auditorToken}` },
  });
  if (monitoringRoute.status !== 404) {
    throw new Error(`Standalone WhatsApp service should not expose monitoring routes, got ${monitoringRoute.status}`);
  }

  console.log(JSON.stringify({
    ok: true,
    service: health.service,
    dashboardRoute: dashboardRoute.status,
    verifyHandshake: verifyResponse.status,
    rejectedVerifyHandshake: rejectedVerifyResponse.status,
    unsignedWebhook: unsignedWebhookResponse.status,
    invalidSignatureWebhook: invalidSignatureWebhookResponse.status,
    monitoringRoute: monitoringRoute.status,
    webhookDryRunSends: webhookData.outbound.dryRun,
  }, null, 2));
} finally {
  child.kill();
}
