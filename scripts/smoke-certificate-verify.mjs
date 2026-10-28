import { spawn } from 'node:child_process';

const port = 3071;
const auditorToken = 'auditor-secret';
const base = `http://localhost:${port}`;

const child = spawn(process.execPath, ['dist/server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    SMART_ESGP_REQUIRE_AUTH: 'true',
    SMART_ESGP_AUDITOR_TOKEN: auditorToken,
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/certificate-verify-smoke-${Date.now()}.json`,
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

try {
  await waitForServer();

  const issueResponse = await fetch(`${base}/api/certificates/issue`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${auditorToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      farmerId: 'f-1',
      issuedBy: 'Certificate Verify Smoke Auditor',
    }),
  });

  if (issueResponse.status !== 201) {
    throw new Error(`Certificate issuance failed with ${issueResponse.status}`);
  }

  const issued = await issueResponse.json();
  const hash = issued.certificate?.verificationHash;
  if (!hash) {
    throw new Error('Expected issued certificate verification hash.');
  }

  const verifyResponse = await fetch(`${base}/api/certificates/verify/${hash}`);
  if (verifyResponse.status !== 200) {
    throw new Error(`Certificate verification failed with ${verifyResponse.status}`);
  }

  const verification = await verifyResponse.json();
  if (verification.valid !== true) {
    throw new Error('Expected verification.valid=true.');
  }
  if (verification.certificate?.verificationHash !== hash) {
    throw new Error('Expected verification hash to match issued certificate.');
  }
  if (verification.farmer?.name !== 'Siti binti Rahman') {
    throw new Error(`Unexpected public farmer name: ${verification.farmer?.name}`);
  }
  if ('issuedBy' in verification.certificate || 'scoreAtIssue' in verification.certificate) {
    throw new Error('Public verification response leaked internal certificate fields.');
  }
  if ('phoneNumber' in verification.farmer || 'auditLogs' in verification.farmer) {
    throw new Error('Public verification response leaked private farmer fields.');
  }

  const missingHash = '0'.repeat(64);
  const missingResponse = await fetch(`${base}/api/certificates/verify/${missingHash}`);
  if (missingResponse.status !== 404) {
    throw new Error(`Expected missing hash 404, got ${missingResponse.status}`);
  }
  const missing = await missingResponse.json();
  if (missing.valid !== false) {
    throw new Error('Expected missing hash to return valid=false.');
  }

  const badHashResponse = await fetch(`${base}/api/certificates/verify/not-a-valid-hash`);
  if (badHashResponse.status !== 400) {
    throw new Error(`Expected invalid hash 400, got ${badHashResponse.status}`);
  }

  console.log(JSON.stringify({
    ok: true,
    certificateNumber: verification.certificate.certificateNumber,
    missingStatus: missingResponse.status,
    invalidStatus: badHashResponse.status,
  }, null, 2));
} finally {
  child.kill();
}
