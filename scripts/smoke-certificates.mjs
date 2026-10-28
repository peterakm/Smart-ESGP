import { spawn } from 'node:child_process';

const port = 3070;
const auditorToken = 'auditor-secret';
const base = `http://localhost:${port}`;

const child = spawn(process.execPath, ['dist/server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    SMART_ESGP_REQUIRE_AUTH: 'true',
    SMART_ESGP_AUDITOR_TOKEN: auditorToken,
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/certificates-smoke-${Date.now()}.json`,
  },
  stdio: 'ignore',
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

  throw new Error('Server did not start.');
};

const authHeaders = {
  authorization: `Bearer ${auditorToken}`,
  'content-type': 'application/json',
};

try {
  await waitForServer();

  const issueResponse = await fetch(`${base}/api/certificates/issue`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      farmerId: 'f-1',
      issuedBy: 'Certificate Smoke Auditor',
    }),
  });

  if (issueResponse.status !== 201) {
    throw new Error(`Expected certificate issue 201, got ${issueResponse.status}`);
  }

  const issueData = await issueResponse.json();
  const certificate = issueData.certificate;
  if (!certificate?.certificateNumber?.startsWith('MS-JHR-')) {
    throw new Error(`Unexpected certificate number: ${certificate?.certificateNumber}`);
  }
  if (!certificate.verificationHash || certificate.verificationHash.length !== 64) {
    throw new Error('Expected a SHA-256 verification hash.');
  }
  if (issueData.farmer?.mspoCertId !== certificate.certificateNumber) {
    throw new Error('Expected farmer certificate ID to match registry certificate number.');
  }

  const reuseResponse = await fetch(`${base}/api/certificates/issue`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      farmerId: 'f-1',
      issuedBy: 'Certificate Smoke Auditor',
    }),
  });

  if (reuseResponse.status !== 200) {
    throw new Error(`Expected idempotent certificate issue 200, got ${reuseResponse.status}`);
  }

  const reuseData = await reuseResponse.json();
  if (reuseData.reused !== true || reuseData.certificate?.id !== certificate.id) {
    throw new Error('Expected second issuance to reuse the active certificate.');
  }

  const listResponse = await fetch(`${base}/api/certificates?farmerId=f-1`, {
    headers: { authorization: `Bearer ${auditorToken}` },
  });

  if (listResponse.status !== 200) {
    throw new Error(`Expected certificate list 200, got ${listResponse.status}`);
  }

  const listed = (await listResponse.json()).certificates || [];
  if (listed.length !== 1 || listed[0].id !== certificate.id) {
    throw new Error(`Expected exactly one active registry record, got ${listed.length}`);
  }

  const auditResponse = await fetch(`${base}/api/audit/events?limit=20`, {
    headers: { authorization: `Bearer ${auditorToken}` },
  });
  const auditEvents = (await auditResponse.json()).events || [];
  const actions = new Set(auditEvents.map((event) => event.action));
  if (!actions.has('certificate.issued') || !actions.has('certificate.issue.reused')) {
    throw new Error('Expected certificate issue audit events.');
  }

  console.log(JSON.stringify({
    ok: true,
    certificateNumber: certificate.certificateNumber,
    reused: reuseData.reused,
    registryCount: listed.length,
  }, null, 2));
} finally {
  child.kill();
}
