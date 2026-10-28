import { spawn } from 'node:child_process';

const port = 3063;
const auditorToken = 'auditor-secret';
const base = `http://localhost:${port}`;

const child = spawn(process.execPath, ['dist/server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    SMART_ESGP_REQUIRE_AUTH: 'true',
    SMART_ESGP_DASHBOARD_ENABLE_WHATSAPP_WEBHOOK: 'true',
    SMART_ESGP_DASHBOARD_ENABLE_WHATSAPP_MANUAL_SEND: 'true',
    SMART_ESGP_AUDITOR_TOKEN: auditorToken,
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/whatsapp-outbound-smoke-${Date.now()}.json`,
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

try {
  await waitForServer();

  const webhookBody = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: '60120000001',
                  id: 'outbound-wa-1',
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

  const webhookResponse = await fetch(`${base}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: webhookBody,
  });

  if (webhookResponse.status !== 200) {
    throw new Error(`Webhook failed with ${webhookResponse.status}`);
  }

  const webhookData = await webhookResponse.json();
  if (webhookData.outbound?.dryRun !== 1) {
    throw new Error(`Expected one dry-run webhook send summary, got ${JSON.stringify(webhookData)}`);
  }
  if ('replies' in webhookData || 'sendResults' in webhookData) {
    throw new Error(`Webhook response should not expose reply/send detail: ${JSON.stringify(webhookData)}`);
  }

  const invalidManualResponse = await fetch(`${base}/api/whatsapp/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${auditorToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      toPhone: 'not-a-phone-number',
      text: 'Smart-ESGP outbound dry-run smoke test.',
    }),
  });

  if (invalidManualResponse.status !== 400) {
    throw new Error(`Invalid manual send recipient should fail with 400, got ${invalidManualResponse.status}`);
  }

  const manualResponse = await fetch(`${base}/api/whatsapp/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${auditorToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      toPhone: '+60 12-000 0001',
      text: 'Smart-ESGP outbound dry-run smoke test.',
    }),
  });

  if (manualResponse.status !== 200) {
    throw new Error(`Manual send failed with ${manualResponse.status}`);
  }

  const manualData = await manualResponse.json();
  if (manualData.sendResult?.mode !== 'dry_run') {
    throw new Error(`Expected dry_run manual send, got ${manualData.sendResult?.mode}`);
  }
  if ('text' in (manualData.sendResult || {}) || 'toPhone' in (manualData.sendResult || {})) {
    throw new Error(`Manual send response leaked outbound text or recipient: ${JSON.stringify(manualData.sendResult)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    webhookDryRunSends: webhookData.outbound.dryRun,
    invalidManualRecipient: invalidManualResponse.status,
    manualSendMode: manualData.sendResult.mode,
    manualSendRecipientExposed: false,
  }, null, 2));
} finally {
  child.kill();
}
