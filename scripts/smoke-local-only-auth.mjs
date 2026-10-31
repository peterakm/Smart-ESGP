import { spawn } from 'node:child_process';

// Checks that with no API tokens configured the open demo API only answers
// requests made directly on this machine, not ones relayed by a tunnel/proxy,
// and that the production build warns when started without a production env.
const port = 3094;
const base = `http://localhost:${port}`;
const stamp = Date.now();
let stderr = '';

const child = spawn(process.execPath, ['dist/server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    NODE_ENV: '',
    SMART_ESGP_DEPLOYMENT_ENV: '',
    SMART_ESGP_REQUIRE_AUTH: '',
    SMART_ESGP_VIEWER_TOKEN: '',
    SMART_ESGP_DEALER_TOKEN: '',
    SMART_ESGP_AUDITOR_TOKEN: '',
    FELDA_VIEWER_TOKEN: '',
    FELDA_DEALER_TOKEN: '',
    FELDA_AUDITOR_TOKEN: '',
    FELDA_API_TOKEN: '',
    SMART_ESGP_OIDC_ISSUER: '',
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/local-only-auth-smoke-${stamp}.json`,
  },
  stdio: ['ignore', 'ignore', 'pipe'],
});
child.stderr.on('data', (chunk) => {
  stderr += chunk;
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

  throw new Error('Local-only auth smoke service did not start.');
};

const statusFor = async (path, headers = {}) => (await fetch(`${base}${path}`, { headers })).status;

try {
  await waitForServer();

  const results = {
    directFarmers: await statusFor('/api/farmers'),
    forwardedForFarmers: await statusFor('/api/farmers', { 'x-forwarded-for': '203.0.113.7' }),
    cloudflareFarmers: await statusFor('/api/farmers', { 'cf-connecting-ip': '203.0.113.7' }),
    forwardedEvidence: await statusFor('/api/evidence', { forwarded: 'for=203.0.113.7' }),
    publicHealth: await statusFor('/health', { 'x-forwarded-for': '203.0.113.7' }),
  };
  const authStatus = await (await fetch(`${base}/api/auth/status`, { headers: { 'x-forwarded-for': '203.0.113.7' } })).json();

  const expected = { directFarmers: 200, forwardedForFarmers: 401, cloudflareFarmers: 401, forwardedEvidence: 401, publicHealth: 200 };
  for (const [key, value] of Object.entries(expected)) {
    if (results[key] !== value) {
      throw new Error(`${key}: expected ${value}, got ${results[key]}`);
    }
  }
  if (authStatus.role) {
    throw new Error(`Proxied /api/auth/status should report no role, got ${authStatus.role}`);
  }
  if (!stderr.includes('production security checks are NOT enforced')) {
    throw new Error('Expected a warning when the production build starts without a production env.');
  }

  console.log(JSON.stringify({ ok: true, ...results }, null, 2));
} finally {
  child.kill();
}
