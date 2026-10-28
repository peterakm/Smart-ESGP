import { createHash } from 'crypto';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { ingestWhatsAppMedia, type WhatsAppMediaStorageConfig } from '../src/services/whatsappMediaStorage';

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const mediaBuffer = Buffer.from('smart-esgp-media-smoke');
const expectedSha256 = createHash('sha256').update(mediaBuffer).digest('hex');
const mediaRoot = await mkdtemp(path.join(tmpdir(), 'smart-esgp-media-'));

const config: WhatsAppMediaStorageConfig = {
  graphApiVersion: 'v23.0',
  accessToken: 'test-token',
  phoneNumberId: '1234567890',
  storageProvider: 'local-filesystem',
  mediaRoot,
};

const fakeFetch: typeof fetch = async (input) => {
  const url = input.toString();

  if (url.includes('/media-smoke-id?')) {
    return new Response(JSON.stringify({
      id: 'media-smoke-id',
      url: 'https://lookaside.fbsbx.com/whatsapp-media-smoke',
      mime_type: 'image/jpeg',
      sha256: 'provider-sha',
      file_size: mediaBuffer.length,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (url === 'https://lookaside.fbsbx.com/whatsapp-media-smoke') {
    return new Response(mediaBuffer, {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    });
  }

  return new Response('unexpected URL', { status: 404 });
};

try {
  const result = await ingestWhatsAppMedia(config, {
    mediaId: 'media-smoke-id',
    farmerId: 'farmer-001',
    providerMessageId: 'wamid-smoke',
    fallbackMimeType: 'image/jpeg',
  }, fakeFetch);

  assert(result.mode === 'stored', 'expected media to be stored');
  assert(result.storageKey === 'farmer-001/wamid-smoke.jpg', 'expected stable storage key');
  assert(result.sha256 === expectedSha256, 'expected downloaded media sha256');
  assert(result.sizeBytes === mediaBuffer.length, 'expected downloaded media size');

  const storedBuffer = await readFile(path.join(mediaRoot, 'farmer-001', 'wamid-smoke.jpg'));
  assert(storedBuffer.equals(mediaBuffer), 'expected media file contents to match download');

  const dryRunResult = await ingestWhatsAppMedia({
    graphApiVersion: 'v23.0',
    storageProvider: 'local-filesystem',
    mediaRoot,
  }, {
    mediaId: 'media-dry-run',
    farmerId: 'farmer-001',
    providerMessageId: 'wamid-dry-run',
    fallbackMimeType: 'image/png',
  }, fakeFetch);

  assert(dryRunResult.mode === 'dry_run', 'expected missing credentials to use dry-run mode');
  assert(dryRunResult.provider === 'none', 'expected dry-run provider to be none');

  const s3Writes: Array<{ bucket: string; key: string; contentType?: string; body: Buffer }> = [];
  const s3Result = await ingestWhatsAppMedia({
    graphApiVersion: 'v23.0',
    accessToken: 'test-token',
    phoneNumberId: '1234567890',
    storageProvider: 's3',
    mediaRoot,
    s3: {
      bucket: 'smart-esgp-smoke-private',
      region: 'ap-southeast-1',
    },
    s3PutObject: async (input) => {
      s3Writes.push({
        bucket: input.bucket,
        key: input.key,
        contentType: input.contentType,
        body: input.body,
      });
    },
  }, {
    mediaId: 'media-smoke-id',
    farmerId: 'farmer-001',
    providerMessageId: 'wamid-s3-smoke',
    fallbackMimeType: 'image/jpeg',
  }, fakeFetch);

  assert(s3Result.mode === 'stored', 'expected S3 media to be stored');
  assert(s3Result.provider === 's3', 'expected S3 provider');
  assert(s3Result.storageKey === 'farmer-001/wamid-s3-smoke.jpg', 'expected stable S3 storage key');
  assert(s3Result.storageUrl === 's3://smart-esgp-smoke-private/farmer-001/wamid-s3-smoke.jpg', 'expected S3 storage URL');
  assert(s3Writes.length === 1, 'expected one S3 put');
  assert(s3Writes[0].body.equals(mediaBuffer), 'expected S3 body to match download');

  console.log(JSON.stringify({
    stored: result.mode,
    storageKey: result.storageKey,
    s3: s3Result.mode,
    dryRun: dryRunResult.mode,
  }, null, 2));
} finally {
  await rm(mediaRoot, { recursive: true, force: true });
}
