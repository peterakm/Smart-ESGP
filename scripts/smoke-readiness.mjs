import { spawn } from 'node:child_process';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (url) => {
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(url);
      if (response.status < 500 || url.endsWith('/ready')) {
        return response;
      }
    } catch {
      await sleep(400);
    }
  }

  throw new Error(`Server did not respond at ${url}`);
};

const runServer = (entrypoint, port, env) => {
  return spawn(process.execPath, [entrypoint], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      // These checks exercise /ready with deliberately unsafe config, so they
      // opt out of the production startup guard (tested separately below).
      SMART_ESGP_ALLOW_INSECURE_STARTUP: 'true',
      ...env,
    },
    stdio: 'ignore',
  });
};

const assertCheck = (readiness, id, status) => {
  const check = readiness.checks?.find((item) => item.id === id);
  if (!check) {
    throw new Error(`Missing readiness check ${id}`);
  }
  if (check.status !== status) {
    throw new Error(`Expected ${id}=${status}, got ${check.status}`);
  }
};

const results = [];

const waitForExit = (child, timeoutMs = 15000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error('Expected server to exit during startup, but it kept running.'));
  }, timeoutMs);
  child.once('exit', (code) => {
    clearTimeout(timer);
    resolve(code);
  });
});

for (const [label, entrypoint, port, env] of [
  ['dashboard-placeholder-auth', 'dist/server.mjs', 3073, {
    SMART_ESGP_REQUIRE_AUTH: 'true',
    SMART_ESGP_VIEWER_TOKEN: 'viewer-change-me',
    SMART_ESGP_AUDITOR_TOKEN: 'auditor-change-me',
  }],
  ['dashboard-no-auth', 'dist/server.mjs', 3074, {
    SMART_ESGP_VIEWER_TOKEN: '',
    SMART_ESGP_DEALER_TOKEN: '',
    SMART_ESGP_AUDITOR_TOKEN: '',
    FELDA_AUDITOR_TOKEN: '',
    FELDA_API_TOKEN: '',
  }],
  ['whatsapp-unsigned-webhooks', 'dist/whatsapp-server.mjs', 3075, {
    WHATSAPP_PORT: '3075',
    WHATSAPP_VERIFY_TOKEN: 'startup-guard-verify-token',
    WHATSAPP_APP_SECRET: '',
    SMART_ESGP_AUDITOR_TOKEN: 'startup-guard-auditor-token',
  }],
]) {
  const child = runServer(entrypoint, port, {
    SMART_ESGP_ALLOW_INSECURE_STARTUP: '',
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/readiness-${label}-${Date.now()}.json`,
    ...env,
  });
  const exitCode = await waitForExit(child);
  if (exitCode === 0) {
    throw new Error(`Expected ${label} startup to fail, but it exited with code 0.`);
  }
  results.push({ service: `${label}-startup-refused`, exitCode });
}

const placeholderDashboard = runServer('dist/server.mjs', 3070, {
  SMART_ESGP_REQUIRE_AUTH: 'true',
  SMART_ESGP_DATA_FILE: `.smart-esgp-data/readiness-placeholder-dashboard-${Date.now()}.json`,
  SMART_ESGP_VIEWER_TOKEN: 'viewer-change-me',
  SMART_ESGP_AUDITOR_TOKEN: 'auditor-change-me',
});

try {
  const response = await waitFor('http://localhost:3070/ready');
  const readiness = await response.json();

  if (response.status !== 503 || readiness.ok !== false) {
    throw new Error(`Expected placeholder dashboard readiness 503, got ${response.status}`);
  }
  assertCheck(readiness, 'dashboard-auth', 'error');
  assertCheck(readiness, 'auditor-token', 'error');
  assertCheck(readiness, 'repository-connectivity', 'ok');
  results.push({ service: 'dashboard-placeholder-secrets', status: response.status });
} finally {
  placeholderDashboard.kill();
}

const misconfiguredDashboard = runServer('dist/server.mjs', 3066, {
  SMART_ESGP_REQUIRE_AUTH: '',
  SMART_ESGP_DATA_FILE: '',
  SMART_ESGP_AUDITOR_TOKEN: '',
  FELDA_AUDITOR_TOKEN: '',
  FELDA_API_TOKEN: '',
});

try {
  const response = await waitFor('http://localhost:3066/ready');
  const readiness = await response.json();

  if (response.status !== 503 || readiness.ok !== false) {
    throw new Error(`Expected dashboard readiness 503, got ${response.status}`);
  }
  assertCheck(readiness, 'data-store', 'error');
  assertCheck(readiness, 'dashboard-auth', 'error');
  assertCheck(readiness, 'auditor-token', 'error');
  assertCheck(readiness, 'repository-connectivity', 'ok');
  results.push({ service: 'dashboard', status: response.status });
} finally {
  misconfiguredDashboard.kill();
}

const misconfiguredWhatsapp = runServer('dist/whatsapp-server.mjs', 3067, {
  SMART_ESGP_DATA_FILE: '',
  SMART_ESGP_MEDIA_DIR: '',
  WHATSAPP_VERIFY_TOKEN: 'change-me-in-production',
  WHATSAPP_APP_SECRET: 'change-me-app-secret',
  WHATSAPP_ACCESS_TOKEN: 'change-me-access-token',
  WHATSAPP_PHONE_NUMBER_ID: 'change-me-phone-id',
  WHATSAPP_REQUEST_TIMEOUT_MS: '999',
  SMART_ESGP_RETAIN_WHATSAPP_RAW_PAYLOADS: 'sometimes',
  SMART_ESGP_AUDITOR_TOKEN: 'auditor-change-me',
  SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS: '5',
});

try {
  const response = await waitFor('http://localhost:3067/ready');
  const readiness = await response.json();

  if (response.status !== 503 || readiness.ok !== false) {
    throw new Error(`Expected WhatsApp readiness 503, got ${response.status}`);
  }
  assertCheck(readiness, 'whatsapp-verify-token', 'error');
  assertCheck(readiness, 'whatsapp-signature', 'error');
  assertCheck(readiness, 'whatsapp-phone-number-id', 'error');
  assertCheck(readiness, 'whatsapp-request-timeout', 'error');
  assertCheck(readiness, 'whatsapp-raw-payload-retention', 'error');
  assertCheck(readiness, 'whatsapp-cloud-api', 'error');
  assertCheck(readiness, 'whatsapp-claim-ttl', 'error');
  assertCheck(readiness, 'media-store', 'error');
  assertCheck(readiness, 'manual-send-auth', 'error');
  assertCheck(readiness, 'repository-connectivity', 'ok');
  results.push({ service: 'whatsapp-misconfigured', status: response.status });
} finally {
  misconfiguredWhatsapp.kill();
}

const placeholderS3Whatsapp = runServer('dist/whatsapp-server.mjs', 3071, {
  SMART_ESGP_DATA_FILE: `.smart-esgp-data/readiness-placeholder-s3-${Date.now()}.json`,
  SMART_ESGP_MEDIA_STORAGE: 's3',
  SMART_ESGP_S3_BUCKET: 'smart-esgp-private-evidence-smoke',
  SMART_ESGP_S3_ENDPOINT: 'http://minio:9000',
  AWS_ACCESS_KEY_ID: 'smart-esgp-minio',
  AWS_SECRET_ACCESS_KEY: 'change-me-minio-secret',
  WHATSAPP_VERIFY_TOKEN: 'runtime-ready-token',
  WHATSAPP_APP_SECRET: 'runtime-ready-secret',
  WHATSAPP_ACCESS_TOKEN: 'runtime-ready-access-token',
  WHATSAPP_PHONE_NUMBER_ID: '123456789012345',
  WHATSAPP_REQUEST_TIMEOUT_MS: '10000',
  SMART_ESGP_RETAIN_WHATSAPP_RAW_PAYLOADS: 'false',
  SMART_ESGP_AUDITOR_TOKEN: 'runtime-ready-auditor-token',
  SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS: '300',
});

try {
  const response = await waitFor('http://localhost:3071/ready');
  const readiness = await response.json();

  if (response.status !== 503 || readiness.ok !== false) {
    throw new Error(`Expected placeholder S3 WhatsApp readiness 503, got ${response.status}`);
  }
  assertCheck(readiness, 'media-store', 'error');
  assertCheck(readiness, 'whatsapp-cloud-api', 'ok');
  assertCheck(readiness, 'repository-connectivity', 'ok');
  results.push({ service: 'whatsapp-placeholder-s3', status: response.status });
} finally {
  placeholderS3Whatsapp.kill();
}

const configuredWhatsapp = runServer('dist/whatsapp-server.mjs', 3068, {
  SMART_ESGP_DATA_FILE: `.smart-esgp-data/readiness-smoke-${Date.now()}.json`,
  SMART_ESGP_MEDIA_DIR: `.smart-esgp-media/readiness-smoke-${Date.now()}`,
  WHATSAPP_VERIFY_TOKEN: 'runtime-ready-token',
  WHATSAPP_APP_SECRET: 'runtime-ready-secret',
  WHATSAPP_ACCESS_TOKEN: 'runtime-ready-access-token',
  WHATSAPP_PHONE_NUMBER_ID: '123456789012345',
  WHATSAPP_REQUEST_TIMEOUT_MS: '10000',
  SMART_ESGP_AUDITOR_TOKEN: 'runtime-ready-auditor-token',
  SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS: '300',
});

try {
  const response = await waitFor('http://localhost:3068/ready');
  const readiness = await response.json();

  if (response.status !== 200 || readiness.ok !== true) {
    throw new Error(`Expected configured WhatsApp readiness 200, got ${response.status}`);
  }
  assertCheck(readiness, 'whatsapp-verify-token', 'ok');
  assertCheck(readiness, 'whatsapp-signature', 'ok');
  assertCheck(readiness, 'whatsapp-graph-api-version', 'ok');
  assertCheck(readiness, 'whatsapp-phone-number-id', 'ok');
  assertCheck(readiness, 'whatsapp-request-timeout', 'ok');
  assertCheck(readiness, 'whatsapp-raw-payload-retention', 'ok');
  assertCheck(readiness, 'whatsapp-cloud-api', 'ok');
  assertCheck(readiness, 'whatsapp-claim-ttl', 'ok');
  assertCheck(readiness, 'repository-connectivity', 'ok');
  results.push({ service: 'whatsapp-configured', status: response.status });
} finally {
  configuredWhatsapp.kill();
}

const configuredWhatsappS3 = runServer('dist/whatsapp-server.mjs', 3069, {
  SMART_ESGP_DATA_FILE: `.smart-esgp-data/readiness-s3-smoke-${Date.now()}.json`,
  SMART_ESGP_MEDIA_STORAGE: 's3',
  SMART_ESGP_MEDIA_DIR: '',
  SMART_ESGP_S3_BUCKET: 'smart-esgp-private-evidence-smoke',
  SMART_ESGP_S3_REGION: 'ap-southeast-1',
  SMART_ESGP_S3_ENDPOINT: 'http://minio:9000',
  AWS_ACCESS_KEY_ID: 'runtime-ready-s3-access-key',
  AWS_SECRET_ACCESS_KEY: 'runtime-ready-s3-secret-key',
  WHATSAPP_VERIFY_TOKEN: 'runtime-ready-token',
  WHATSAPP_APP_SECRET: 'runtime-ready-secret',
  WHATSAPP_ACCESS_TOKEN: 'runtime-ready-access-token',
  WHATSAPP_PHONE_NUMBER_ID: '123456789012345',
  WHATSAPP_REQUEST_TIMEOUT_MS: '10000',
  SMART_ESGP_RETAIN_WHATSAPP_RAW_PAYLOADS: 'false',
  SMART_ESGP_AUDITOR_TOKEN: 'runtime-ready-auditor-token',
  SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS: '300',
});

try {
  const response = await waitFor('http://localhost:3069/ready');
  const readiness = await response.json();

  if (response.status !== 200 || readiness.ok !== true) {
    throw new Error(`Expected configured S3 WhatsApp readiness 200, got ${response.status}`);
  }
  assertCheck(readiness, 'media-store', 'ok');
  assertCheck(readiness, 'repository-connectivity', 'ok');
  results.push({ service: 'whatsapp-s3-configured', status: response.status });
} finally {
  configuredWhatsappS3.kill();
}

const displayNumberWhatsapp = runServer('dist/whatsapp-server.mjs', 3072, {
  SMART_ESGP_DATA_FILE: `.smart-esgp-data/readiness-display-number-${Date.now()}.json`,
  SMART_ESGP_MEDIA_DIR: `.smart-esgp-media/readiness-display-number-${Date.now()}`,
  WHATSAPP_VERIFY_TOKEN: 'runtime-ready-token',
  WHATSAPP_APP_SECRET: 'runtime-ready-secret',
  WHATSAPP_ACCESS_TOKEN: 'runtime-ready-access-token',
  WHATSAPP_PHONE_NUMBER_ID: '+60123456789',
  WHATSAPP_REQUEST_TIMEOUT_MS: '10000',
  SMART_ESGP_RETAIN_WHATSAPP_RAW_PAYLOADS: 'false',
  SMART_ESGP_AUDITOR_TOKEN: 'runtime-ready-auditor-token',
  SMART_ESGP_WHATSAPP_CLAIM_TTL_SECONDS: '300',
});

try {
  const response = await waitFor('http://localhost:3072/ready');
  const readiness = await response.json();

  if (response.status !== 503 || readiness.ok !== false) {
    throw new Error(`Expected display-number WhatsApp readiness 503, got ${response.status}`);
  }
  assertCheck(readiness, 'whatsapp-phone-number-id', 'error');
  assertCheck(readiness, 'repository-connectivity', 'ok');
  results.push({ service: 'whatsapp-display-number-rejected', status: response.status });
} finally {
  displayNumberWhatsapp.kill();
}

console.log(JSON.stringify({
  ok: true,
  results,
}, null, 2));
