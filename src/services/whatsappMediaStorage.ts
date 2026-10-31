import { createHash } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { EvidenceMediaStorage } from '../types';

const DEFAULT_GRAPH_API_VERSION = 'v23.0';
const DEFAULT_MEDIA_ROOT = '.smart-esgp-media';

type MediaStorageProvider = 'local-filesystem' | 's3';

interface S3MediaStorageConfig {
 bucket: string;
 region: string;
 endpoint?: string;
 forcePathStyle?: boolean;
}

interface S3PutObjectInput {
 bucket: string;
 key: string;
 body: Buffer;
 contentType?: string;
 metadata: Record<string, string>;
}

export interface WhatsAppMediaStorageConfig {
 graphApiVersion: string;
 accessToken?: string;
 phoneNumberId?: string;
 storageProvider: MediaStorageProvider;
 mediaRoot: string;
 s3?: S3MediaStorageConfig;
 s3PutObject?: (input: S3PutObjectInput) => Promise<void>;
}

export interface WhatsAppMediaIngestRequest {
 mediaId: string;
 farmerId: string;
 providerMessageId: string;
 fallbackMimeType?: string;
}

export interface WhatsAppMediaMetadata {
 id: string;
 url: string;
 mimeType?: string;
 sha256?: string;
 fileSize?: number;
}

type FetchLike = typeof fetch;

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
 return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
};

const asString = (value: unknown) => {
 return typeof value === 'string' ? value : undefined;
};

const asNumber = (value: unknown) => {
 return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

// WhatsApp caps audio at 16 MB and images at 5 MB; anything larger is not a
// genuine evidence upload and should not be held in memory or stored.
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

const safeSegment = (value: string) => {
 return value.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120) || 'unknown';
};

const extensionForContentType = (contentType?: string) => {
 const normalized = contentType?.split(';')[0]?.trim().toLowerCase();

 if (normalized === 'image/jpeg') return 'jpg';
 if (normalized === 'image/png') return 'png';
 if (normalized === 'image/webp') return 'webp';
 if (normalized === 'audio/ogg') return 'ogg';
 if (normalized === 'audio/mpeg') return 'mp3';

 return 'bin';
};

const normalizeStorageProvider = (value?: string): MediaStorageProvider => {
 const normalized = value?.trim().toLowerCase();
 if (!normalized || normalized === 'local' || normalized === 'local-filesystem') {
 return 'local-filesystem';
 }
 if (normalized === 's3' || normalized === 'object-storage') {
 return 's3';
 }
 throw new Error('SMART_ESGP_MEDIA_STORAGE must be local-filesystem or s3.');
};

const buildStorageKey = (request: WhatsAppMediaIngestRequest, contentType?: string) => {
 const extension = extensionForContentType(contentType || request.fallbackMimeType);
 return [
 safeSegment(request.farmerId),
 `${safeSegment(request.providerMessageId || request.mediaId)}.${extension}`,
 ].join('/');
};

const responseErrorText = async (response: Response) => {
 try {
 return (await response.text()).slice(0, 500);
 } catch {
 return `HTTP ${response.status}`;
 }
};

export const createWhatsAppMediaStorageConfig = (env: NodeJS.ProcessEnv): WhatsAppMediaStorageConfig => ({
 graphApiVersion: env.WHATSAPP_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION,
 accessToken: env.WHATSAPP_ACCESS_TOKEN,
 phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
 storageProvider: normalizeStorageProvider(env.SMART_ESGP_MEDIA_STORAGE),
 mediaRoot: env.SMART_ESGP_MEDIA_DIR || DEFAULT_MEDIA_ROOT,
 s3: env.SMART_ESGP_S3_BUCKET
 ? {
 bucket: env.SMART_ESGP_S3_BUCKET,
 region: env.SMART_ESGP_S3_REGION || env.AWS_REGION || 'ap-southeast-1',
 endpoint: env.SMART_ESGP_S3_ENDPOINT,
 forcePathStyle: env.SMART_ESGP_S3_FORCE_PATH_STYLE === 'true',
 }
 : undefined,
});

export const retrieveWhatsAppMediaMetadata = async (
 config: WhatsAppMediaStorageConfig,
 mediaId: string,
 fetchImpl: FetchLike = fetch
): Promise<WhatsAppMediaMetadata> => {
 if (!config.accessToken || !config.phoneNumberId) {
 throw new Error('WhatsApp media credentials are not configured.');
 }

 const url = new URL(
 `https://graph.facebook.com/${encodeURIComponent(config.graphApiVersion)}/${encodeURIComponent(mediaId)}`
 );
 url.searchParams.set('phone_number_id', config.phoneNumberId);

 const response = await fetchImpl(url, {
 headers: {
 authorization: `Bearer ${config.accessToken}`,
 },
 });

 if (!response.ok) {
 throw new Error(`Failed to retrieve WhatsApp media metadata: ${await responseErrorText(response)}`);
 }

 const parsed = asRecord(await response.json());
 const mediaUrl = asString(parsed?.url);

 if (!mediaUrl) {
 throw new Error('WhatsApp media metadata did not include a download URL.');
 }

 return {
 id: asString(parsed?.id) || mediaId,
 url: mediaUrl,
 mimeType: asString(parsed?.mime_type),
 sha256: asString(parsed?.sha256),
 fileSize: asNumber(parsed?.file_size),
 };
};

export const downloadWhatsAppMedia = async (
 config: WhatsAppMediaStorageConfig,
 mediaUrl: string,
 fetchImpl: FetchLike = fetch
) => {
 if (!config.accessToken) {
 throw new Error('WhatsApp media access token is not configured.');
 }

 const response = await fetchImpl(mediaUrl, {
 headers: {
 authorization: `Bearer ${config.accessToken}`,
 },
 });

 if (!response.ok) {
 throw new Error(`Failed to download WhatsApp media: ${await responseErrorText(response)}`);
 }

 const declaredBytes = Number(response.headers.get('content-length'));
 if (Number.isFinite(declaredBytes) && declaredBytes > MAX_MEDIA_BYTES) {
 throw new Error(`WhatsApp media is ${declaredBytes} bytes, above the ${MAX_MEDIA_BYTES} byte limit.`);
 }

 const buffer = Buffer.from(await response.arrayBuffer());
 if (buffer.length > MAX_MEDIA_BYTES) {
 throw new Error(`WhatsApp media is ${buffer.length} bytes, above the ${MAX_MEDIA_BYTES} byte limit.`);
 }

 return {
 buffer,
 contentType: response.headers.get('content-type') || undefined,
 };
};

const putS3Object = async (
 config: WhatsAppMediaStorageConfig,
 input: S3PutObjectInput
) => {
 if (config.s3PutObject) {
 await config.s3PutObject(input);
 return;
 }

 const client = new S3Client({
 region: config.s3?.region,
 endpoint: config.s3?.endpoint,
 forcePathStyle: config.s3?.forcePathStyle,
 });

 await client.send(new PutObjectCommand({
 Bucket: input.bucket,
 Key: input.key,
 Body: input.body,
 ContentType: input.contentType,
 Metadata: input.metadata,
 ServerSideEncryption: 'AES256',
 }));
};

const storeMediaObject = async (
 config: WhatsAppMediaStorageConfig,
 request: WhatsAppMediaIngestRequest,
 downloaded: { buffer: Buffer; contentType?: string },
 metadata: WhatsAppMediaMetadata,
 storageKey: string,
 contentType?: string
) => {
 if (config.storageProvider === 's3') {
 if (!config.s3?.bucket) {
 throw new Error('SMART_ESGP_S3_BUCKET is required when SMART_ESGP_MEDIA_STORAGE=s3.');
 }

 await putS3Object(config, {
 bucket: config.s3.bucket,
 key: storageKey,
 body: downloaded.buffer,
 contentType,
 metadata: {
 farmerId: safeSegment(request.farmerId),
 providerMessageId: safeSegment(request.providerMessageId),
 mediaId: safeSegment(request.mediaId),
 providerSha256: metadata.sha256 || '',
 },
 });

 return {
 provider: 's3' as const,
 storageUrl: `s3://${config.s3.bucket}/${storageKey}`,
 };
 }

 const targetPath = path.join(config.mediaRoot, ...storageKey.split('/'));
 await mkdir(path.dirname(targetPath), { recursive: true });
 await writeFile(targetPath, downloaded.buffer);

 return {
 provider: 'local-filesystem' as const,
 };
};

export const ingestWhatsAppMedia = async (
 config: WhatsAppMediaStorageConfig,
 request: WhatsAppMediaIngestRequest,
 fetchImpl: FetchLike = fetch
): Promise<EvidenceMediaStorage> => {
 const storedAt = new Date().toISOString();
 const fallbackStorageKey = ['dry-run', safeSegment(request.farmerId), safeSegment(request.mediaId)].join('/');

 if (!config.accessToken || !config.phoneNumberId) {
 return {
 mode: 'dry_run',
 provider: 'none',
 storageKey: fallbackStorageKey,
 contentType: request.fallbackMimeType,
 storedAt,
 };
 }

 try {
 const metadata = await retrieveWhatsAppMediaMetadata(config, request.mediaId, fetchImpl);
 const downloaded = await downloadWhatsAppMedia(config, metadata.url, fetchImpl);
 const contentType = downloaded.contentType || metadata.mimeType || request.fallbackMimeType;
 const storageKey = buildStorageKey(request, contentType);
 const sha256 = createHash('sha256').update(downloaded.buffer).digest('hex');
 const stored = await storeMediaObject(config, request, downloaded, metadata, storageKey, contentType);

 return {
 mode: 'stored',
 provider: stored.provider,
 storageKey,
 storageUrl: stored.storageUrl,
 contentType,
 sizeBytes: downloaded.buffer.length,
 sha256,
 providerSha256: metadata.sha256,
 storedAt,
 };
 } catch (error) {
 return {
 mode: 'failed',
 provider: config.storageProvider,
 storageKey: fallbackStorageKey,
 contentType: request.fallbackMimeType,
 storedAt,
 error: error instanceof Error ? error.message : 'Unknown WhatsApp media ingestion error.',
 };
 }
};
