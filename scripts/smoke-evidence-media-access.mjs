import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { initialFarmers } from '../src/data/mockFarmers.ts';
import { createSmartEsgpRepository } from '../src/server/smartEsgpRepository.ts';

const port = 3074;
const viewerToken = 'viewer-secret';
const base = `http://localhost:${port}`;
const stamp = Date.now();
const dataFile = `.smart-esgp-data/media-access-smoke-${stamp}.json`;
const mediaRoot = `.smart-esgp-media/media-access-smoke-${stamp}`;
const localStorageKey = 'f-1/wamid-media-access.jpg';
const mediaBuffer = Buffer.from('smart-esgp-protected-media-access');
const sha256 = createHash('sha256').update(mediaBuffer).digest('hex');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForServer = async () => {
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(`${base}/api/auth/status`);
      if (response.status < 500) return;
    } catch {
      await sleep(400);
    }
  }

  throw new Error('Server did not start.');
};

await mkdir(path.join(mediaRoot, 'f-1'), { recursive: true });
await writeFile(path.join(mediaRoot, localStorageKey), mediaBuffer);

const repository = createSmartEsgpRepository(initialFarmers, { dataFilePath: dataFile });
repository.recordEvidence([
  {
    id: 'ev-media-access-local',
    farmerId: 'f-1',
    source: 'whatsapp',
    evidenceType: 'daily_checkin',
    activityType: 'harvest',
    verificationStatus: 'received',
    phoneNumber: '60128880001',
    providerMessageId: 'wamid-media-access',
    mediaId: 'media-access-local',
    mimeType: 'image/jpeg',
    location: { lat: 2.035, lng: 103.325 },
    receivedAt: '2026-07-23T00:00:00.000Z',
    createdAt: '2026-07-23T00:00:01.000Z',
    summary: 'Protected media access smoke evidence.',
    mediaStorage: {
      mode: 'stored',
      provider: 'local-filesystem',
      storageKey: localStorageKey,
      contentType: 'image/jpeg',
      sizeBytes: mediaBuffer.length,
      sha256,
      storedAt: '2026-07-23T00:00:01.000Z',
    },
    review: { status: 'pending' },
  },
  {
    id: 'ev-media-access-s3',
    farmerId: 'f-1',
    source: 'whatsapp',
    evidenceType: 'daily_checkin',
    activityType: 'inspect',
    verificationStatus: 'received',
    phoneNumber: '60128880001',
    providerMessageId: 'wamid-media-access-s3',
    mediaId: 'media-access-s3',
    mimeType: 'image/jpeg',
    location: { lat: 2.035, lng: 103.325 },
    receivedAt: '2026-07-23T00:01:00.000Z',
    createdAt: '2026-07-23T00:01:01.000Z',
    summary: 'Protected S3 media access smoke evidence.',
    mediaStorage: {
      mode: 'stored',
      provider: 's3',
      storageKey: 'f-1/wamid-media-access-s3.jpg',
      storageUrl: 's3://smart-esgp-smoke-private/f-1/wamid-media-access-s3.jpg',
      contentType: 'image/jpeg',
      sizeBytes: mediaBuffer.length,
      sha256,
      storedAt: '2026-07-23T00:01:01.000Z',
    },
    review: { status: 'pending' },
  },
]);

const child = spawn(process.execPath, ['dist/server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(port),
    SMART_ESGP_REQUIRE_AUTH: 'true',
    SMART_ESGP_VIEWER_TOKEN: viewerToken,
    SMART_ESGP_DATA_FILE: dataFile,
    SMART_ESGP_MEDIA_DIR: mediaRoot,
    SMART_ESGP_MEDIA_STORAGE: 's3',
    SMART_ESGP_S3_BUCKET: 'smart-esgp-smoke-private',
    SMART_ESGP_S3_REGION: 'ap-southeast-1',
    AWS_ACCESS_KEY_ID: 'smoke-access-key',
    AWS_SECRET_ACCESS_KEY: 'smoke-secret-key',
  },
  stdio: 'ignore',
});

const authHeaders = {
  authorization: `Bearer ${viewerToken}`,
};

try {
  await waitForServer();

  const unauthenticated = await fetch(`${base}/api/evidence/ev-media-access-local/media-url`);
  assert(unauthenticated.status === 401, `Expected unauthenticated media URL request to return 401, got ${unauthenticated.status}`);

  const localAccessResponse = await fetch(`${base}/api/evidence/ev-media-access-local/media-url`, {
    headers: authHeaders,
  });
  assert(localAccessResponse.status === 200, `Expected local media URL response 200, got ${localAccessResponse.status}`);
  const localAccess = await localAccessResponse.json();
  assert(localAccess.accessMode === 'authenticated_fetch', 'Expected local media to require authenticated fetch.');
  assert(localAccess.provider === 'local-filesystem', 'Expected local media provider.');

  const mediaResponse = await fetch(`${base}${localAccess.url}`, {
    headers: authHeaders,
  });
  assert(mediaResponse.status === 200, `Expected media stream 200, got ${mediaResponse.status}`);
  assert(mediaResponse.headers.get('x-smart-esgp-sha256') === sha256, 'Expected media hash header.');
  const streamedBuffer = Buffer.from(await mediaResponse.arrayBuffer());
  assert(streamedBuffer.equals(mediaBuffer), 'Expected streamed media contents to match stored file.');

  const s3AccessResponse = await fetch(`${base}/api/evidence/ev-media-access-s3/media-url`, {
    headers: authHeaders,
  });
  assert(s3AccessResponse.status === 200, `Expected S3 media URL response 200, got ${s3AccessResponse.status}`);
  const s3Access = await s3AccessResponse.json();
  assert(s3Access.accessMode === 'direct_url', 'Expected S3 media to use direct presigned URL.');
  assert(s3Access.provider === 's3', 'Expected S3 provider.');
  assert(s3Access.url.includes('X-Amz-Signature='), 'Expected S3 URL to include a signature.');

  const auditResponse = await fetch(`${base}/api/audit/events?limit=20`, {
    headers: authHeaders,
  });
  const auditEvents = (await auditResponse.json()).events || [];
  assert(
    auditEvents.some((event) => event.action === 'evidence.media_access.requested'),
    'Expected media access audit event.'
  );

  console.log(JSON.stringify({
    ok: true,
    localAccessMode: localAccess.accessMode,
    s3AccessMode: s3Access.accessMode,
    streamedBytes: streamedBuffer.length,
  }, null, 2));
} finally {
  child.kill();
  await rm(mediaRoot, { recursive: true, force: true });
}
