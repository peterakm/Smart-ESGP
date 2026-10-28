import { spawn } from 'node:child_process';

const port = 3091;
const auditorToken = 'auditor-secret';
const base = `http://localhost:${port}`;

const child = spawn(process.execPath, ['dist/server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    SMART_ESGP_REQUIRE_AUTH: 'true',
    SMART_ESGP_AUDITOR_TOKEN: auditorToken,
    SMART_ESGP_API_LIST_LIMIT_MAX: '7',
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/list-limits-smoke-${Date.now()}.json`,
  },
  stdio: 'ignore',
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForServer = async () => {
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.status === 200) return;
    } catch {
      await sleep(400);
    }
  }

  throw new Error('List-limit smoke server did not start.');
};

const authHeaders = {
  authorization: `Bearer ${auditorToken}`,
};

const expectLimit = async (path, expectedLimit) => {
  const response = await fetch(`${base}${path}`, {
    headers: authHeaders,
  });

  if (response.status !== 200) {
    throw new Error(`${path}: expected 200, got ${response.status}`);
  }

  const body = await response.json();
  if (body.limit !== expectedLimit) {
    throw new Error(`${path}: expected applied limit ${expectedLimit}, got ${body.limit}`);
  }

  return body.limit;
};

try {
  await waitForServer();

  const results = {
    evidenceHuge: await expectLimit('/api/evidence?limit=999999', 7),
    consentsHuge: await expectLimit('/api/consents?limit=999999', 7),
    auditHuge: await expectLimit('/api/audit/events?limit=999999', 7),
    certificatesHuge: await expectLimit('/api/certificates?limit=999999', 7),
    whatsappHuge: await expectLimit('/api/whatsapp/events?limit=999999', 7),
    farmerWhatsappHuge: await expectLimit('/api/whatsapp/farmers/f-1/events?limit=999999', 7),
    evidenceNegative: await expectLimit('/api/evidence?limit=-10', 1),
    auditDefault: await expectLimit('/api/audit/events', 7),
  };

  console.log(JSON.stringify({
    ok: true,
    results,
  }, null, 2));
} finally {
  child.kill();
}
