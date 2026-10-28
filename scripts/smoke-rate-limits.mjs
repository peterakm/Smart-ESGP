import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForHealth = async (baseUrl, label) => {
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status === 200) {
        return;
      }
    } catch {
      await sleep(400);
    }
  }

  throw new Error(`${label} did not become healthy.`);
};

const expectRateLimited = async (label, response, expectedLimit) => {
  if (response.status !== 429) {
    throw new Error(`${label}: expected 429, got ${response.status}.`);
  }
  if (response.headers.get('ratelimit-limit') !== String(expectedLimit)) {
    throw new Error(`${label}: expected ratelimit-limit ${expectedLimit}.`);
  }
  if (!response.headers.get('retry-after')) {
    throw new Error(`${label}: expected retry-after header.`);
  }

  const body = await response.json();
  if (!body.error || !body.requestId) {
    throw new Error(`${label}: expected JSON error with requestId.`);
  }
};

const dashboardPort = 3087;
const dashboardBase = `http://localhost:${dashboardPort}`;
const dashboard = spawn(process.execPath, ['dist/server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    SMART_ESGP_DEPLOYMENT_ENV: 'production',
    PORT: String(dashboardPort),
    SMART_ESGP_REQUIRE_AUTH: 'true',
    SMART_ESGP_AUDITOR_TOKEN: 'rate-limit-dashboard-auditor',
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/rate-limit-dashboard-${Date.now()}.json`,
    SMART_ESGP_CERTIFICATE_VERIFY_RATE_LIMIT_PER_MINUTE: '2',
  },
  stdio: 'ignore',
});

const results = {};

try {
  await waitForHealth(dashboardBase, 'dashboard');

  const badHash = 'not-a-valid-hash';
  const first = await fetch(`${dashboardBase}/api/certificates/verify/${badHash}`);
  const second = await fetch(`${dashboardBase}/api/certificates/verify/${badHash}`);
  const third = await fetch(`${dashboardBase}/api/certificates/verify/${badHash}`);

  if (first.status !== 400 || second.status !== 400) {
    throw new Error(`Expected first two certificate verify requests to hit route validation, got ${first.status}/${second.status}.`);
  }
  await expectRateLimited('certificate verify', third, 2);

  results.dashboard = {
    certificateVerify: [first.status, second.status, third.status],
  };
} finally {
  dashboard.kill();
}

const whatsappPort = 3088;
const whatsappBase = `http://localhost:${whatsappPort}`;
const whatsapp = spawn(process.execPath, ['dist/whatsapp-server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    SMART_ESGP_DEPLOYMENT_ENV: 'production',
    WHATSAPP_PORT: String(whatsappPort),
    SMART_ESGP_REQUIRE_AUTH: 'true',
    SMART_ESGP_AUDITOR_TOKEN: 'rate-limit-whatsapp-auditor',
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/rate-limit-whatsapp-${Date.now()}.json`,
    SMART_ESGP_MEDIA_DIR: `.smart-esgp-media/rate-limit-whatsapp-${Date.now()}`,
    WHATSAPP_VERIFY_TOKEN: 'rate-limit-verify-token',
    WHATSAPP_APP_SECRET: '',
    // Unsigned test webhooks need the production startup guard bypassed.
    SMART_ESGP_ALLOW_INSECURE_STARTUP: 'true',
    WHATSAPP_ACCESS_TOKEN: '',
    WHATSAPP_PHONE_NUMBER_ID: '',
    SMART_ESGP_WHATSAPP_WEBHOOK_RATE_LIMIT_PER_MINUTE: '1',
    SMART_ESGP_WHATSAPP_MANUAL_SEND_RATE_LIMIT_PER_MINUTE: '1',
  },
  stdio: 'ignore',
});

try {
  await waitForHealth(whatsappBase, 'whatsapp');

  const webhookBody = (id) => JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: '60129990009',
                  id,
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

  const firstWebhook = await fetch(`${whatsappBase}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: webhookBody('rate-limit-wa-1'),
  });
  const secondWebhook = await fetch(`${whatsappBase}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: webhookBody('rate-limit-wa-2'),
  });

  if (firstWebhook.status !== 200) {
    throw new Error(`Expected first webhook request 200, got ${firstWebhook.status}.`);
  }
  await expectRateLimited('whatsapp webhook', secondWebhook, 1);

  const manualBody = JSON.stringify({
    toPhone: '60129990009',
    text: 'Rate limit smoke.',
  });
  const firstManual = await fetch(`${whatsappBase}/api/whatsapp/messages`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer rate-limit-whatsapp-auditor',
      'content-type': 'application/json',
    },
    body: manualBody,
  });
  const secondManual = await fetch(`${whatsappBase}/api/whatsapp/messages`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer rate-limit-whatsapp-auditor',
      'content-type': 'application/json',
    },
    body: manualBody,
  });

  if (firstManual.status !== 200) {
    throw new Error(`Expected first manual send 200, got ${firstManual.status}.`);
  }
  await expectRateLimited('whatsapp manual send', secondManual, 1);

  results.whatsapp = {
    webhook: [firstWebhook.status, secondWebhook.status],
    manualSend: [firstManual.status, secondManual.status],
  };
} finally {
  whatsapp.kill();
}

console.log(JSON.stringify({
  ok: true,
  results,
}, null, 2));
