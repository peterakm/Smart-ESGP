import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { EvidenceRecord } from '../types';
import type { WhatsAppMediaStorageConfig } from '../services/whatsappMediaStorage';

const DEFAULT_MEDIA_ACCESS_TTL_SECONDS = 300;

export interface EvidenceMediaAccess {
 accessMode: 'direct_url' | 'authenticated_fetch';
 url: string;
 expiresAt?: string;
 provider: NonNullable<EvidenceRecord['mediaStorage']>['provider'];
}

const assertStoredEvidenceMedia = (record: EvidenceRecord) => {
 if (record.mediaStorage?.mode !== 'stored' || !record.mediaStorage.storageKey) {
 throw new Error('Evidence media is not available for access.');
 }

 // Restate storageKey so callers get it typed as present, not optional.
 return { ...record.mediaStorage, storageKey: record.mediaStorage.storageKey };
};

export const resolveLocalEvidenceMediaPath = (
 mediaRoot: string,
 storageKey: string
) => {
 const rootPath = path.resolve(mediaRoot);
 const targetPath = path.resolve(rootPath, ...storageKey.split('/'));
 const relative = path.relative(rootPath, targetPath);

 if (relative.startsWith('..') || path.isAbsolute(relative)) {
 throw new Error('Evidence media storage key resolves outside SMART_ESGP_MEDIA_DIR.');
 }

 return targetPath;
};

export const createEvidenceMediaAccess = async (
 config: WhatsAppMediaStorageConfig,
 record: EvidenceRecord,
 options: { ttlSeconds?: number } = {}
): Promise<EvidenceMediaAccess> => {
 const mediaStorage = assertStoredEvidenceMedia(record);
 const ttlSeconds = options.ttlSeconds ?? DEFAULT_MEDIA_ACCESS_TTL_SECONDS;
 const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

 if (mediaStorage.provider === 's3') {
 if (!config.s3?.bucket) {
 throw new Error('SMART_ESGP_S3_BUCKET is required to access S3 evidence media.');
 }

 const client = new S3Client({
 region: config.s3.region,
 endpoint: config.s3.endpoint,
 forcePathStyle: config.s3.forcePathStyle,
 });
 const url = await getSignedUrl(
 client,
 new GetObjectCommand({
 Bucket: config.s3.bucket,
 Key: mediaStorage.storageKey,
 }),
 { expiresIn: ttlSeconds }
 );

 return {
 accessMode: 'direct_url',
 url,
 expiresAt,
 provider: 's3',
 };
 }

 if (mediaStorage.provider === 'local-filesystem') {
 return {
 accessMode: 'authenticated_fetch',
 url: `/api/evidence/${encodeURIComponent(record.id)}/media`,
 expiresAt,
 provider: 'local-filesystem',
 };
 }

 throw new Error('Evidence media provider does not support access URLs.');
};

export const openLocalEvidenceMedia = async (
 config: WhatsAppMediaStorageConfig,
 record: EvidenceRecord
) => {
 const mediaStorage = assertStoredEvidenceMedia(record);

 if (mediaStorage.provider !== 'local-filesystem') {
 throw new Error('Evidence media is not stored on the local filesystem.');
 }

 const filePath = resolveLocalEvidenceMediaPath(config.mediaRoot, mediaStorage.storageKey);
 await stat(filePath);

 return {
 stream: createReadStream(filePath),
 contentType: mediaStorage.contentType || 'application/octet-stream',
 sizeBytes: mediaStorage.sizeBytes,
 sha256: mediaStorage.sha256,
 };
};
