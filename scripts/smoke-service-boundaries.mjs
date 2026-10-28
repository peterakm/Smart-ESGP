import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (url, label) => {
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(url);
      if (response.status < 500) {
        return response;
      }
    } catch {
      await sleep(400);
    }
  }

  throw new Error(`${label} did not start.`);
};

const startServer = (entrypoint, port, env) => {
  return spawn(process.execPath, [entrypoint], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      SMART_ESGP_REQUIRE_AUTH: 'true',
      SMART_ESGP_AUDITOR_TOKEN: 'boundary-auditor-token',
      WHATSAPP_APP_SECRET: '',
      // Unsigned test webhooks need the production startup guard bypassed.
      SMART_ESGP_ALLOW_INSECURE_STARTUP: 'true',
      WHATSAPP_ACCESS_TOKEN: '',
      WHATSAPP_PHONE_NUMBER_ID: '',
      SMART_ESGP_DATA_FILE: `.smart-esgp-data/service-boundaries-${entrypoint.replace(/[^\w-]/g, '-')}-${Date.now()}.json`,
      ...env,
    },
    stdio: 'ignore',
  });
};

const expectStatus = async (label, response, expectedStatus) => {
  if (response.status !== expectedStatus) {
    throw new Error(`${label}: expected ${expectedStatus}, got ${response.status}`);
  }
};

const authHeaders = {
  authorization: 'Bearer boundary-auditor-token',
};

const webhookBody = JSON.stringify({
  entry: [
    {
      changes: [
        {
          value: {
            messages: [
              {
                from: '60129990001',
                id: 'boundary-wa-1',
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

const results = {};

const dashboardPort = 3079;
const dashboardBase = `http://localhost:${dashboardPort}`;
const dashboard = startServer('dist/server.mjs', dashboardPort);

try {
  await waitFor(`${dashboardBase}/health`, 'Dashboard');

  const dashboardWebhookGet = await fetch(`${dashboardBase}/api/whatsapp/webhook`);
  await expectStatus('dashboard webhook GET', dashboardWebhookGet, 404);

  const dashboardWebhookPost = await fetch(`${dashboardBase}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: webhookBody,
  });
  await expectStatus('dashboard webhook POST', dashboardWebhookPost, 404);

  const dashboardManualSend = await fetch(`${dashboardBase}/api/whatsapp/messages`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      toPhone: '60129990001',
      text: 'Boundary smoke test.',
    }),
  });
  await expectStatus('dashboard manual send', dashboardManualSend, 404);

  const dashboardMonitoring = await fetch(`${dashboardBase}/api/whatsapp/events`, {
    headers: authHeaders,
  });
  await expectStatus('dashboard monitoring', dashboardMonitoring, 200);

  const dashboardFarmerMonitoring = await fetch(`${dashboardBase}/api/whatsapp/farmers/f-1/events`, {
    headers: authHeaders,
  });
  await expectStatus('dashboard farmer monitoring', dashboardFarmerMonitoring, 200);

  const dashboardMessageClaims = await fetch(`${dashboardBase}/api/whatsapp/message-claims`, {
    headers: authHeaders,
  });
  await expectStatus('dashboard message claims', dashboardMessageClaims, 200);

  results.dashboard = {
    webhookGet: dashboardWebhookGet.status,
    webhookPost: dashboardWebhookPost.status,
    manualSend: dashboardManualSend.status,
    monitoring: dashboardMonitoring.status,
    farmerMonitoring: dashboardFarmerMonitoring.status,
    messageClaims: dashboardMessageClaims.status,
  };
} finally {
  dashboard.kill();
}

const whatsappPort = 3080;
const whatsappBase = `http://localhost:${whatsappPort}`;
const whatsapp = startServer('dist/whatsapp-server.mjs', whatsappPort);

try {
  await waitFor(`${whatsappBase}/health`, 'WhatsApp service');

  const standaloneWebhook = await fetch(`${whatsappBase}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: webhookBody,
  });
  await expectStatus('standalone webhook POST', standaloneWebhook, 200);
  const webhookData = await standaloneWebhook.json();
  if (webhookData.outbound?.dryRun !== 1) {
    throw new Error(`Expected standalone webhook dry-run summary, got ${JSON.stringify(webhookData)}`);
  }
  if ('replies' in webhookData || 'sendResults' in webhookData) {
    throw new Error(`Standalone webhook leaked reply/send details: ${JSON.stringify(webhookData)}`);
  }

  const standaloneManualSend = await fetch(`${whatsappBase}/api/whatsapp/messages`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      toPhone: '60129990001',
      text: 'Boundary smoke test.',
    }),
  });
  await expectStatus('standalone manual send', standaloneManualSend, 200);

  const standaloneFarmers = await fetch(`${whatsappBase}/api/farmers`, {
    headers: authHeaders,
  });
  await expectStatus('standalone farmers route', standaloneFarmers, 404);

  const standaloneMonitoring = await fetch(`${whatsappBase}/api/whatsapp/events`, {
    headers: authHeaders,
  });
  await expectStatus('standalone monitoring route', standaloneMonitoring, 404);

  const standaloneFarmerMonitoring = await fetch(`${whatsappBase}/api/whatsapp/farmers/f-1/events`, {
    headers: authHeaders,
  });
  await expectStatus('standalone farmer monitoring route', standaloneFarmerMonitoring, 404);

  const standaloneMessageClaims = await fetch(`${whatsappBase}/api/whatsapp/message-claims`, {
    headers: authHeaders,
  });
  await expectStatus('standalone message claims route', standaloneMessageClaims, 404);

  results.whatsapp = {
    webhookPost: standaloneWebhook.status,
    webhookDryRunSends: webhookData.outbound.dryRun,
    manualSend: standaloneManualSend.status,
    farmers: standaloneFarmers.status,
    monitoring: standaloneMonitoring.status,
    farmerMonitoring: standaloneFarmerMonitoring.status,
    messageClaims: standaloneMessageClaims.status,
  };
} finally {
  whatsapp.kill();
}

console.log(JSON.stringify({
  ok: true,
  results,
}, null, 2));
