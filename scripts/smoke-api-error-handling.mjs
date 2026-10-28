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

const expectJsonError = async (label, response, expectedStatus, expectedError) => {
  const contentType = response.headers.get('content-type') || '';
  const responseRequestId = response.headers.get('x-request-id');

  if (response.status !== expectedStatus) {
    throw new Error(`${label}: expected ${expectedStatus}, got ${response.status}.`);
  }
  if (!contentType.includes('application/json')) {
    throw new Error(`${label}: expected JSON error response, got ${contentType || 'no content-type'}.`);
  }

  const body = await response.json();
  if (body.error !== expectedError) {
    throw new Error(`${label}: expected error "${expectedError}", got "${body.error}".`);
  }

  if (!responseRequestId || body.requestId !== responseRequestId) {
    throw new Error(`${label}: expected matching response/body request IDs.`);
  }

  return body.requestId;
};

const runErrorCheck = async ({ label, entrypoint, port, portEnv = 'PORT', invalidJsonPath, bodyLimitEnv }) => {
  const child = spawn(process.execPath, [entrypoint], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SMART_ESGP_DEPLOYMENT_ENV: 'production',
      SMART_ESGP_REQUIRE_AUTH: 'true',
      SMART_ESGP_AUDITOR_TOKEN: `${label}-auditor-token`,
      SMART_ESGP_ENABLE_TEST_ERROR_ROUTE: 'true',
      SMART_ESGP_DATA_FILE: `.smart-esgp-data/api-error-${label}-${Date.now()}.json`,
      SMART_ESGP_MEDIA_DIR: `.smart-esgp-media/api-error-${label}-${Date.now()}`,
      WHATSAPP_VERIFY_TOKEN: 'api-error-verify-token',
      WHATSAPP_APP_SECRET: 'api-error-app-secret',
      WHATSAPP_ACCESS_TOKEN: 'api-error-access-token',
      WHATSAPP_PHONE_NUMBER_ID: 'api-error-phone-id',
      [bodyLimitEnv]: '1kb',
      [portEnv]: String(port),
    },
    stdio: 'ignore',
  });

  const baseUrl = `http://localhost:${port}`;

  try {
    await waitForHealth(baseUrl, label);

    const invalidJson = await fetch(`${baseUrl}${invalidJsonPath}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': `${label}-invalid-json-request`,
      },
      body: '{"broken"',
    });
    const invalidJsonRequestId = await expectJsonError(`${label} invalid json`, invalidJson, 400, 'Invalid JSON request body.');
    if (invalidJsonRequestId !== `${label}-invalid-json-request`) {
      throw new Error(`${label}: expected incoming request ID to be preserved.`);
    }

    const asyncError = await fetch(`${baseUrl}/api/__test/async-error`);
    const asyncErrorRequestId = await expectJsonError(`${label} async error`, asyncError, 500, 'Internal server error.');

    const oversizedBody = await fetch(`${baseUrl}${invalidJsonPath}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': `${label}-oversized-json-request`,
      },
      body: JSON.stringify({
        message: 'x'.repeat(2048),
        farmerId: 'f-1',
        history: [],
        entry: [],
      }),
    });
    const oversizedRequestId = await expectJsonError(`${label} oversized json`, oversizedBody, 413, 'Request body is too large.');
    if (oversizedRequestId !== `${label}-oversized-json-request`) {
      throw new Error(`${label}: expected oversized request ID to be preserved.`);
    }

    return {
      label,
      invalidJson: invalidJson.status,
      invalidJsonRequestId,
      asyncError: asyncError.status,
      asyncErrorRequestId,
      oversizedJson: oversizedBody.status,
      oversizedRequestId,
    };
  } finally {
    child.kill();
  }
};

const results = [
  await runErrorCheck({
    label: 'dashboard',
    entrypoint: 'dist/server.mjs',
    port: 3085,
    invalidJsonPath: '/api/chat',
    bodyLimitEnv: 'SMART_ESGP_DASHBOARD_JSON_BODY_LIMIT',
  }),
  await runErrorCheck({
    label: 'whatsapp',
    entrypoint: 'dist/whatsapp-server.mjs',
    port: 3086,
    portEnv: 'WHATSAPP_PORT',
    invalidJsonPath: '/api/whatsapp/webhook',
    bodyLimitEnv: 'SMART_ESGP_WHATSAPP_JSON_BODY_LIMIT',
  }),
];

console.log(JSON.stringify({
  ok: true,
  results,
}, null, 2));
