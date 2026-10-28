import { spawn } from 'node:child_process';
import http from 'node:http';

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

const expectHeader = (response, name, expected) => {
  const actual = response.headers.get(name);
  if (actual !== expected) {
    throw new Error(`Expected ${name}=${expected}, got ${actual}.`);
  }
};

const expectRawHeader = (headers, name, expected) => {
  const actual = headers[name];
  const headerValue = Array.isArray(actual) ? actual[0] : actual;
  if (headerValue !== expected) {
    throw new Error(`Expected ${name}=${expected}, got ${headerValue}.`);
  }
};

const rawHttpRequest = ({ port, path, headers = {} }) => new Promise((resolve, reject) => {
  const request = http.request({
    hostname: '127.0.0.1',
    port,
    path,
    method: 'GET',
    headers,
  }, (response) => {
    response.resume();
    response.on('end', () => {
      resolve({
        status: response.statusCode,
        headers: response.headers,
      });
    });
  });

  request.on('error', reject);
  request.end();
});

const expectReadinessCheck = async (baseUrl, id, status) => {
  const response = await fetch(`${baseUrl}/ready`);
  if (response.status !== 200) {
    throw new Error(`Expected readiness 200, got ${response.status}.`);
  }

  const readiness = await response.json();
  const check = readiness.checks?.find((item) => item.id === id);
  if (check?.status !== status) {
    throw new Error(`Expected readiness ${id}=${status}, got ${check?.status || 'missing'}.`);
  }
};

const runSecurityCheck = async ({ label, entrypoint, port, portEnv = 'PORT' }) => {
  const child = spawn(process.execPath, [entrypoint], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      SMART_ESGP_DEPLOYMENT_ENV: 'production',
      SMART_ESGP_REQUIRE_AUTH: 'true',
      SMART_ESGP_AUDITOR_TOKEN: `${label.toLowerCase()}-auditor-token`,
      SMART_ESGP_DATA_FILE: `.smart-esgp-data/security-baseline-${label.toLowerCase()}-${Date.now()}.json`,
      SMART_ESGP_MEDIA_DIR: `.smart-esgp-media/security-baseline-${label.toLowerCase()}-${Date.now()}`,
      SMART_ESGP_ALLOWED_ORIGINS: 'https://felda.example,https://ops.felda.example',
      SMART_ESGP_FORCE_HTTPS: 'true',
      SMART_ESGP_HSTS_MAX_AGE_SECONDS: '31536000',
      WHATSAPP_VERIFY_TOKEN: 'security-baseline-verify-token',
      WHATSAPP_APP_SECRET: 'security-baseline-app-secret',
      WHATSAPP_ACCESS_TOKEN: 'security-baseline-access-token',
      WHATSAPP_PHONE_NUMBER_ID: '123456789012345',
      [portEnv]: String(port),
    },
    stdio: 'ignore',
  });

  const baseUrl = `http://localhost:${port}`;

  try {
    await waitForHealth(baseUrl, label);

    const health = await fetch(`${baseUrl}/health`, {
      headers: {
        origin: 'https://felda.example',
        'x-request-id': `${label}-security-request`,
      },
    });
    expectHeader(health, 'x-content-type-options', 'nosniff');
    expectHeader(health, 'referrer-policy', 'no-referrer');
    expectHeader(health, 'x-frame-options', 'DENY');
    expectHeader(health, 'strict-transport-security', 'max-age=31536000; includeSubDomains');
    expectHeader(health, 'access-control-allow-origin', 'https://felda.example');
    expectHeader(health, 'x-request-id', `${label}-security-request`);
    if (health.headers.get('x-powered-by')) {
      throw new Error(`${label} should not expose x-powered-by.`);
    }

    const allowedPreflight = await fetch(`${baseUrl}/api/farmers`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://ops.felda.example',
        'access-control-request-method': 'GET',
      },
    });
    if (allowedPreflight.status !== 204) {
      throw new Error(`${label} allowed preflight expected 204, got ${allowedPreflight.status}.`);
    }
    expectHeader(allowedPreflight, 'access-control-allow-origin', 'https://ops.felda.example');

    const rejectedPreflight = await fetch(`${baseUrl}/api/farmers`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://untrusted.example',
        'access-control-request-method': 'GET',
      },
    });
    if (rejectedPreflight.status !== 403) {
      throw new Error(`${label} rejected preflight expected 403, got ${rejectedPreflight.status}.`);
    }

    await expectReadinessCheck(baseUrl, 'cors-origin-policy', 'ok');
    await expectReadinessCheck(baseUrl, 'https-enforcement', 'ok');
    await expectReadinessCheck(baseUrl, 'hsts-policy', 'ok');

    const httpsRedirect = await rawHttpRequest({
      port,
      path: '/health',
      headers: {
        Host: `${label}.felda.example`,
      },
    });
    if (httpsRedirect.status !== 308) {
      throw new Error(`${label} HTTPS redirect expected 308, got ${httpsRedirect.status}.`);
    }
    expectRawHeader(httpsRedirect.headers, 'location', `https://${label}.felda.example/health`);

    return {
      label,
      headers: {
        contentTypeOptions: health.headers.get('x-content-type-options'),
        frameOptions: health.headers.get('x-frame-options'),
        allowedOrigin: health.headers.get('access-control-allow-origin'),
      },
      allowedPreflight: allowedPreflight.status,
      rejectedPreflight: rejectedPreflight.status,
      httpsRedirect: httpsRedirect.status,
    };
  } finally {
    child.kill();
  }
};

const results = [
  await runSecurityCheck({
    label: 'dashboard',
    entrypoint: 'dist/server.mjs',
    port: 3083,
  }),
  await runSecurityCheck({
    label: 'whatsapp',
    entrypoint: 'dist/whatsapp-server.mjs',
    port: 3084,
    portEnv: 'WHATSAPP_PORT',
  }),
];

console.log(JSON.stringify({
  ok: true,
  results,
}, null, 2));
