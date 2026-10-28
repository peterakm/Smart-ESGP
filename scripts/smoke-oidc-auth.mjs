import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const port = 3076;
const jwksPort = 3077;
const base = `http://localhost:${port}`;
const issuer = `http://localhost:${jwksPort}`;
const audience = 'smart-esgp-dashboard';
const keyId = 'smart-esgp-smoke-key';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const { publicKey, privateKey } = await generateKeyPair('RS256');
const publicJwk = await exportJWK(publicKey);
const jwks = {
  keys: [
    {
      ...publicJwk,
      kid: keyId,
      alg: 'RS256',
      use: 'sig',
    },
  ],
};

const jwksServer = createServer((req, res) => {
  if (req.url === '/.well-known/jwks.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(jwks));
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

await new Promise((resolve) => jwksServer.listen(jwksPort, resolve));

const signToken = async (subject, roles) => {
  return new SignJWT({ roles })
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(privateKey);
};

const viewerJwt = await signToken('felda-viewer-1', ['smart-esgp.viewer']);
const auditorJwt = await signToken('felda-auditor-1', ['smart-esgp.auditor']);
const noRoleJwt = await signToken('felda-no-role-1', ['unrelated.role']);

const child = spawn(process.execPath, ['dist/server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    SMART_ESGP_OIDC_ISSUER: issuer,
    SMART_ESGP_OIDC_AUDIENCE: audience,
    SMART_ESGP_OIDC_JWKS_URI: `${issuer}/.well-known/jwks.json`,
    SMART_ESGP_OIDC_ROLE_CLAIM: 'roles',
    SMART_ESGP_DATA_FILE: `.smart-esgp-data/oidc-auth-smoke-${Date.now()}.json`,
  },
  stdio: 'ignore',
});

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

const expectStatus = async (label, response, expectedStatus) => {
  if (response.status !== expectedStatus) {
    throw new Error(`${label}: expected ${expectedStatus}, got ${response.status}`);
  }
};

try {
  await waitForServer();

  const noToken = await fetch(`${base}/api/farmers`);
  await expectStatus('no-token read', noToken, 401);

  const noRoleRead = await fetch(`${base}/api/farmers`, {
    headers: { authorization: `Bearer ${noRoleJwt}` },
  });
  await expectStatus('no-role read', noRoleRead, 401);

  const viewerRead = await fetch(`${base}/api/farmers`, {
    headers: { authorization: `Bearer ${viewerJwt}` },
  });
  await expectStatus('oidc viewer read', viewerRead, 200);
  const farmer = (await viewerRead.json()).farmers[0];

  const viewerWrite = await fetch(`${base}/api/farmers/${farmer.id}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${viewerJwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(farmer),
  });
  await expectStatus('oidc viewer write', viewerWrite, 403);

  const auditorWrite = await fetch(`${base}/api/farmers/${farmer.id}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${auditorJwt}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(farmer),
  });
  await expectStatus('oidc auditor write', auditorWrite, 200);

  const auditResponse = await fetch(`${base}/api/audit/events?limit=20`, {
    headers: { authorization: `Bearer ${auditorJwt}` },
  });
  await expectStatus('oidc auditor audit read', auditResponse, 200);
  const auditEvents = (await auditResponse.json()).events || [];
  assert(
    auditEvents.some((event) => event.action === 'farmer.updated' && event.actorId === 'felda-auditor-1'),
    'Expected farmer.updated audit event to use OIDC subject as actorId.'
  );

  console.log(JSON.stringify({
    ok: true,
    noToken: noToken.status,
    noRoleRead: noRoleRead.status,
    viewerRead: viewerRead.status,
    viewerWrite: viewerWrite.status,
    auditorWrite: auditorWrite.status,
    oidcAuditActor: 'felda-auditor-1',
  }, null, 2));
} finally {
  child.kill();
  await new Promise((resolve) => jwksServer.close(resolve));
}
