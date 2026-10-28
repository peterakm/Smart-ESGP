import fs from 'node:fs';
import path from 'node:path';
import type { WhatsAppFarmerSession, WhatsAppProviderMessageClaim, WhatsAppSendResult, WhatsAppWebhookEvent } from '../contracts/whatsapp';
import type { CertificateRecord, ConsentRecord, EvidenceRecord, EvidenceReview, Farmer, SystemAuditEvent } from '../types';
import {
 type FileRepositoryRetentionLimits,
 normalizeFileRepositoryRetentionLimits,
} from './fileRepositoryRetention';

const clone = <T>(value: T): T => {
 return JSON.parse(JSON.stringify(value)) as T;
};

export type MaybePromise<T> = T | Promise<T>;

export interface SmartEsgpRepositoryHealth {
 ok: boolean;
 message: string;
}

export interface WhatsAppProviderMessageClaimOptions {
 now?: string;
 claimTtlMs?: number;
}

export interface WhatsAppEventListFilters {
 gpsReview?: boolean;
 outboundMode?: WhatsAppSendResult['mode'];
}

export interface EvidenceListFilters {
 review?: 'open';
 locationValidationStatus?: NonNullable<EvidenceRecord['locationValidation']>['status'];
}

export interface SystemAuditEventFilters {
 service?: SystemAuditEvent['service'];
 severity?: SystemAuditEvent['severity'];
 entityType?: SystemAuditEvent['entityType'];
 action?: string;
}

export interface SmartEsgpRepository {
 checkHealth: () => MaybePromise<SmartEsgpRepositoryHealth>;
 listFarmers: () => MaybePromise<Farmer[]>;
 getFarmer: (farmerId: string) => MaybePromise<Farmer | undefined>;
 hasFarmer: (farmerId: string) => MaybePromise<boolean>;
 getFarmerIndex: () => MaybePromise<Map<string, Farmer>>;
 upsertFarmer: (farmer: Farmer) => MaybePromise<Farmer>;
 recordEvidence: (records: EvidenceRecord[]) => MaybePromise<void>;
 listEvidence: (farmerId?: string, limit?: number, filters?: EvidenceListFilters) => MaybePromise<EvidenceRecord[]>;
 getEvidence: (evidenceId: string) => MaybePromise<EvidenceRecord | undefined>;
 updateEvidenceReview: (
 evidenceId: string,
 review: EvidenceReview,
 verificationStatus: EvidenceRecord['verificationStatus']
 ) => MaybePromise<EvidenceRecord | undefined>;
 getWhatsAppSession: (phoneNumber: string) => MaybePromise<WhatsAppFarmerSession | undefined>;
 getWhatsAppSessionIndex: () => MaybePromise<Map<string, WhatsAppFarmerSession>>;
 listWhatsAppSessions: () => MaybePromise<WhatsAppFarmerSession[]>;
 upsertWhatsAppSession: (session: WhatsAppFarmerSession) => MaybePromise<WhatsAppFarmerSession>;
 claimWhatsAppProviderMessageIds: (
 providerMessageIds: string[],
 options?: WhatsAppProviderMessageClaimOptions
 ) => MaybePromise<Set<string>>;
 recordWhatsAppProviderMessageDuplicates: (providerMessageIds: string[]) => MaybePromise<void>;
 getExistingWhatsAppProviderMessageIds: (providerMessageIds: string[]) => MaybePromise<Set<string>>;
 listWhatsAppProviderMessageClaims: (limit?: number) => MaybePromise<WhatsAppProviderMessageClaim[]>;
 recordWhatsAppEvents: (events: WhatsAppWebhookEvent[]) => MaybePromise<void>;
 listWhatsAppEvents: (limit?: number, filters?: WhatsAppEventListFilters) => MaybePromise<WhatsAppWebhookEvent[]>;
 listWhatsAppEventsForFarmer: (farmerId: string, limit?: number, filters?: WhatsAppEventListFilters) => MaybePromise<WhatsAppWebhookEvent[]>;
 recordSystemAuditEvents: (events: SystemAuditEvent[]) => MaybePromise<void>;
 listSystemAuditEvents: (limit?: number, filters?: SystemAuditEventFilters) => MaybePromise<SystemAuditEvent[]>;
 upsertCertificate: (certificate: CertificateRecord) => MaybePromise<CertificateRecord>;
 listCertificates: (farmerId?: string, limit?: number) => MaybePromise<CertificateRecord[]>;
 getActiveCertificateForFarmer: (farmerId: string) => MaybePromise<CertificateRecord | undefined>;
 getCertificateByVerificationHash: (verificationHash: string) => MaybePromise<CertificateRecord | undefined>;
 recordConsentRecords: (records: ConsentRecord[]) => MaybePromise<void>;
 listConsentRecords: (filters?: { farmerId?: string; phoneNumber?: string }, limit?: number) => MaybePromise<ConsentRecord[]>;
 linkConsentRecordsToFarmer: (phoneNumber: string, farmerId: string) => MaybePromise<ConsentRecord[]>;
 close?: () => MaybePromise<void>;
}

interface SmartEsgpStoreFile {
 version: 1;
 savedAt: string;
 farmers: Farmer[];
 whatsappWebhookEvents: WhatsAppWebhookEvent[];
 whatsappSessions?: WhatsAppFarmerSession[];
 whatsappProviderMessageClaims?: Array<string | WhatsAppProviderMessageClaim>;
 evidenceRecords?: EvidenceRecord[];
 systemAuditEvents?: SystemAuditEvent[];
 certificateRecords?: CertificateRecord[];
 consentRecords?: ConsentRecord[];
}

interface SmartEsgpRepositoryOptions {
 dataFilePath?: string;
 retention?: Partial<FileRepositoryRetentionLimits>;
}

const isStoreFile = (value: unknown): value is SmartEsgpStoreFile => {
 if (!value || typeof value !== 'object') return false;
 const candidate = value as Partial<SmartEsgpStoreFile>;
 return candidate.version === 1 && Array.isArray(candidate.farmers) && Array.isArray(candidate.whatsappWebhookEvents);
};

const readStoreFile = (dataFilePath: string): SmartEsgpStoreFile | undefined => {
 if (!fs.existsSync(dataFilePath)) {
 return undefined;
 }

 const parsed = JSON.parse(fs.readFileSync(dataFilePath, 'utf8')) as unknown;
 if (!isStoreFile(parsed)) {
 throw new Error(`Smart-ESGP data file has an unsupported shape: ${dataFilePath}`);
 }

 return parsed;
};

const asWhatsAppProviderMessageClaim = (
 value: string | WhatsAppProviderMessageClaim
): WhatsAppProviderMessageClaim => {
 if (typeof value === 'string') {
 return {
 providerMessageId: value,
 status: 'claimed',
 claimedAt: new Date(0).toISOString(),
 claimExpiresAt: new Date(0).toISOString(),
 duplicateCount: 0,
 };
 }

 return {
 providerMessageId: value.providerMessageId,
 status: value.status === 'processed' ? 'processed' : 'claimed',
 claimedAt: value.claimedAt || new Date(0).toISOString(),
 claimExpiresAt: value.claimExpiresAt,
 processedAt: value.processedAt,
 duplicateCount: Number.isFinite(value.duplicateCount) ? value.duplicateCount : 0,
 lastDuplicateAt: value.lastDuplicateAt,
 };
};

export const createSmartEsgpRepository = (
 seedFarmers: Farmer[],
 options: SmartEsgpRepositoryOptions = {}
): SmartEsgpRepository => {
 const retentionLimits = normalizeFileRepositoryRetentionLimits(options.retention);
 const existingStore = options.dataFilePath ? readStoreFile(options.dataFilePath) : undefined;
 const farmersById = new Map<string, Farmer>(
 (existingStore?.farmers || seedFarmers).map((farmer) => [farmer.id, clone(farmer)])
 );
 const whatsappWebhookEvents: WhatsAppWebhookEvent[] = existingStore?.whatsappWebhookEvents
 ? existingStore.whatsappWebhookEvents.map((event) => clone(event))
 : [];
 const whatsappSessionsByPhone = new Map<string, WhatsAppFarmerSession>(
 (existingStore?.whatsappSessions || []).map((session) => [session.phoneNumber, clone(session)])
 );
 const whatsappProviderMessageClaims = new Map<string, WhatsAppProviderMessageClaim>();
 (existingStore?.whatsappProviderMessageClaims || [])
 .map(asWhatsAppProviderMessageClaim)
 .forEach((claim) => whatsappProviderMessageClaims.set(claim.providerMessageId, clone(claim)));
 whatsappWebhookEvents.forEach((event) => {
 const existingClaim = whatsappProviderMessageClaims.get(event.inbound.providerMessageId);
 whatsappProviderMessageClaims.set(event.inbound.providerMessageId, {
 providerMessageId: event.inbound.providerMessageId,
 status: 'processed',
 claimedAt: existingClaim?.claimedAt || event.storedAt,
 processedAt: existingClaim?.processedAt || event.storedAt,
 duplicateCount: existingClaim?.duplicateCount || 0,
 lastDuplicateAt: existingClaim?.lastDuplicateAt,
 });
 });
 const evidenceRecords: EvidenceRecord[] = existingStore?.evidenceRecords
 ? existingStore.evidenceRecords.map((record) => clone(record))
 : [];
 const systemAuditEvents: SystemAuditEvent[] = existingStore?.systemAuditEvents
 ? existingStore.systemAuditEvents.map((event) => clone(event))
 : [];
 const certificateRecords: CertificateRecord[] = existingStore?.certificateRecords
 ? existingStore.certificateRecords.map((certificate) => clone(certificate))
 : [];
 const consentRecords: ConsentRecord[] = existingStore?.consentRecords
 ? existingStore.consentRecords.map((record) => clone(record))
 : [];

 const save = () => {
 if (!options.dataFilePath) return;

 const store: SmartEsgpStoreFile = {
 version: 1,
 savedAt: new Date().toISOString(),
 farmers: [...farmersById.values()].map((farmer) => clone(farmer)),
 whatsappWebhookEvents: whatsappWebhookEvents.map((event) => clone(event)),
 whatsappSessions: [...whatsappSessionsByPhone.values()].map((session) => clone(session)),
 whatsappProviderMessageClaims: [...whatsappProviderMessageClaims.values()].map((claim) => clone(claim)),
 evidenceRecords: evidenceRecords.map((record) => clone(record)),
 systemAuditEvents: systemAuditEvents.map((event) => clone(event)),
 certificateRecords: certificateRecords.map((certificate) => clone(certificate)),
 consentRecords: consentRecords.map((record) => clone(record)),
 };

 fs.mkdirSync(path.dirname(options.dataFilePath), { recursive: true });
 fs.writeFileSync(options.dataFilePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
 };

 if (options.dataFilePath && !existingStore) {
 save();
 }

 return {
 checkHealth: () => {
 if (!options.dataFilePath) {
 return {
 ok: true,
 message: 'In-memory file repository is available.',
 };
 }

 try {
 fs.accessSync(options.dataFilePath, fs.constants.R_OK | fs.constants.W_OK);
 return {
 ok: true,
 message: 'File repository data file is readable and writable.',
 };
 } catch (error) {
 return {
 ok: false,
 message: error instanceof Error ? error.message : 'File repository data file is not accessible.',
 };
 }
 },

 listFarmers: () => [...farmersById.values()].map((farmer) => clone(farmer)),

 getFarmer: (farmerId: string) => {
 const farmer = farmersById.get(farmerId);
 return farmer ? clone(farmer) : undefined;
 },

 hasFarmer: (farmerId: string) => farmersById.has(farmerId),

 getFarmerIndex: () => {
 return new Map(
 [...farmersById.entries()].map(([farmerId, farmer]) => [farmerId, clone(farmer)])
 );
 },

 upsertFarmer: (farmer: Farmer) => {
 const nextFarmer = clone(farmer);
 farmersById.set(nextFarmer.id, nextFarmer);
 save();
 return clone(nextFarmer);
 },

 recordEvidence: (records: EvidenceRecord[]) => {
 const existingIds = new Set(evidenceRecords.map((record) => record.id));
 records.forEach((record) => {
 const nextRecord = clone({
 ...record,
 reviewHistory: record.reviewHistory || (record.review ? [record.review] : []),
 });
 if (!existingIds.has(nextRecord.id)) {
 evidenceRecords.push(nextRecord);
 existingIds.add(nextRecord.id);
 }
 });
 if (evidenceRecords.length > retentionLimits.evidenceRecordLimit) {
 evidenceRecords.splice(0, evidenceRecords.length - retentionLimits.evidenceRecordLimit);
 }
 save();
 },

 listEvidence: (farmerId?: string, limit = 50, filters = {}) => {
 return evidenceRecords
 .filter((record) => !farmerId || record.farmerId === farmerId)
 .filter((record) => {
 if (filters.review !== 'open') return true;
 const reviewStatus = record.review?.status
 || (record.verificationStatus === 'verified'
 ? 'approved'
 : record.verificationStatus === 'needs_review'
 ? 'flagged'
 : 'pending');
 return reviewStatus === 'pending' || reviewStatus === 'flagged';
 })
 .filter((record) => !filters.locationValidationStatus || record.locationValidation?.status === filters.locationValidationStatus)
 .slice(-limit)
 .reverse()
 .map((record) => clone(record));
 },

 getEvidence: (evidenceId: string) => {
 const record = evidenceRecords.find((item) => item.id === evidenceId);
 return record ? clone(record) : undefined;
 },

 updateEvidenceReview: (evidenceId, review, verificationStatus) => {
 const recordIndex = evidenceRecords.findIndex((record) => record.id === evidenceId);
 if (recordIndex === -1) {
 return undefined;
 }

 const nextRecord: EvidenceRecord = {
 ...evidenceRecords[recordIndex],
 verificationStatus,
 review: clone(review),
 reviewHistory: [
 ...(evidenceRecords[recordIndex].reviewHistory || (
 evidenceRecords[recordIndex].review ? [evidenceRecords[recordIndex].review] : []
 )),
 clone(review),
 ],
 };

 evidenceRecords[recordIndex] = nextRecord;
 save();

 return clone(nextRecord);
 },

 getWhatsAppSession: (phoneNumber: string) => {
 const session = whatsappSessionsByPhone.get(phoneNumber);
 return session ? clone(session) : undefined;
 },

 getWhatsAppSessionIndex: () => {
 return new Map(
 [...whatsappSessionsByPhone.entries()].map(([phoneNumber, session]) => [phoneNumber, clone(session)])
 );
 },

 listWhatsAppSessions: () => {
 return [...whatsappSessionsByPhone.values()]
 .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
 .map((session) => clone(session));
 },

 upsertWhatsAppSession: (session: WhatsAppFarmerSession) => {
 const nextSession = clone(session);
 whatsappSessionsByPhone.set(nextSession.phoneNumber, nextSession);
 save();
 return clone(nextSession);
 },

 claimWhatsAppProviderMessageIds: (providerMessageIds, claimOptions = {}) => {
 const claimedIds = new Set<string>();
 const uniqueProviderMessageIds = [...new Set(providerMessageIds.filter(Boolean))];
 const now = claimOptions.now || new Date().toISOString();
 const claimTtlMs = claimOptions.claimTtlMs ?? 5 * 60 * 1000;
 const claimExpiresAt = new Date(new Date(now).getTime() + claimTtlMs).toISOString();

 uniqueProviderMessageIds.forEach((providerMessageId) => {
 const existingClaim = whatsappProviderMessageClaims.get(providerMessageId);
 const staleClaim = existingClaim?.status === 'claimed'
 && (!existingClaim.claimExpiresAt || existingClaim.claimExpiresAt <= now);

 if (!existingClaim || staleClaim) {
 whatsappProviderMessageClaims.set(providerMessageId, {
 providerMessageId,
 status: 'claimed',
 claimedAt: now,
 claimExpiresAt,
 duplicateCount: existingClaim?.duplicateCount || 0,
 lastDuplicateAt: existingClaim?.lastDuplicateAt,
 processedAt: undefined,
 });
 claimedIds.add(providerMessageId);
 }
 });

 if (whatsappProviderMessageClaims.size > retentionLimits.whatsappProviderMessageClaimLimit) {
 const overflow = whatsappProviderMessageClaims.size - retentionLimits.whatsappProviderMessageClaimLimit;
 [...whatsappProviderMessageClaims.values()]
 .sort((a, b) => a.claimedAt.localeCompare(b.claimedAt))
 .slice(0, overflow)
 .forEach(({ providerMessageId }) => {
 whatsappProviderMessageClaims.delete(providerMessageId);
 });
 }

 if (claimedIds.size > 0) {
 save();
 }

 return claimedIds;
 },

 recordWhatsAppProviderMessageDuplicates: (providerMessageIds) => {
 const now = new Date().toISOString();
 let changed = false;

 [...new Set(providerMessageIds.filter(Boolean))].forEach((providerMessageId) => {
 const existingClaim = whatsappProviderMessageClaims.get(providerMessageId);
 if (existingClaim) {
 whatsappProviderMessageClaims.set(providerMessageId, {
 ...existingClaim,
 duplicateCount: existingClaim.duplicateCount + 1,
 lastDuplicateAt: now,
 });
 changed = true;
 }
 });

 if (changed) {
 save();
 }
 },

 recordWhatsAppEvents: (events: WhatsAppWebhookEvent[]) => {
 const existingProviderMessageIds = new Set(
 whatsappWebhookEvents.map((event) => event.inbound.providerMessageId)
 );
 events.forEach((event) => {
 const existingClaim = whatsappProviderMessageClaims.get(event.inbound.providerMessageId);
 whatsappProviderMessageClaims.set(event.inbound.providerMessageId, {
 providerMessageId: event.inbound.providerMessageId,
 status: 'processed',
 claimedAt: existingClaim?.claimedAt || event.storedAt,
 processedAt: event.storedAt,
 duplicateCount: existingClaim?.duplicateCount || 0,
 lastDuplicateAt: existingClaim?.lastDuplicateAt,
 });
 if (!existingProviderMessageIds.has(event.inbound.providerMessageId)) {
 whatsappWebhookEvents.push(clone(event));
 existingProviderMessageIds.add(event.inbound.providerMessageId);
 }
 });
 if (whatsappWebhookEvents.length > retentionLimits.whatsappEventLimit) {
 whatsappWebhookEvents.splice(0, whatsappWebhookEvents.length - retentionLimits.whatsappEventLimit);
 }
 save();
 },

 getExistingWhatsAppProviderMessageIds: (providerMessageIds) => {
 const requestedIds = new Set(providerMessageIds);
 return new Set(
 [...whatsappProviderMessageClaims.keys()].filter((providerMessageId) => requestedIds.has(providerMessageId))
 );
 },

 listWhatsAppProviderMessageClaims: (limit = 25) => {
 return [...whatsappProviderMessageClaims.values()]
 .sort((a, b) =>
 (b.processedAt || b.lastDuplicateAt || b.claimedAt)
 .localeCompare(a.processedAt || a.lastDuplicateAt || a.claimedAt)
 )
 .slice(0, limit)
 .map((claim) => clone(claim));
 },

 listWhatsAppEvents: (limit = 25, filters = {}) => {
 return whatsappWebhookEvents
 .filter((event) => {
 if (!filters.gpsReview) return true;
 const status = event.reply.evidence?.locationValidation?.status;
 return status === 'outside_plot' || status === 'unknown_plot' || status === 'missing_location';
 })
 .filter((event) => !filters.outboundMode || event.outbound?.mode === filters.outboundMode)
 .slice(-limit)
 .reverse()
 .map((event) => clone(event));
 },

 listWhatsAppEventsForFarmer: (farmerId, limit = 25, filters = {}) => {
 return whatsappWebhookEvents
 .filter((event) => event.reply.farmerId === farmerId || event.session?.farmerId === farmerId)
 .filter((event) => {
 if (!filters.gpsReview) return true;
 const status = event.reply.evidence?.locationValidation?.status;
 return status === 'outside_plot' || status === 'unknown_plot' || status === 'missing_location';
 })
 .filter((event) => !filters.outboundMode || event.outbound?.mode === filters.outboundMode)
 .slice(-limit)
 .reverse()
 .map((event) => clone(event));
 },

 recordSystemAuditEvents: (events) => {
 systemAuditEvents.push(...events.map((event) => clone(event)));
 if (systemAuditEvents.length > retentionLimits.systemAuditEventLimit) {
 systemAuditEvents.splice(0, systemAuditEvents.length - retentionLimits.systemAuditEventLimit);
 }
 save();
 },

 listSystemAuditEvents: (limit = 50, filters = {}) => {
 return systemAuditEvents
 .filter((event) => !filters.service || event.service === filters.service)
 .filter((event) => !filters.severity || event.severity === filters.severity)
 .filter((event) => !filters.entityType || event.entityType === filters.entityType)
 .filter((event) => !filters.action || event.action === filters.action)
 .slice(-limit)
 .reverse()
 .map((event) => clone(event));
 },

 upsertCertificate: (certificate) => {
 const nextCertificate = clone(certificate);
 const existingIndex = certificateRecords.findIndex((record) => record.id === nextCertificate.id);

 if (existingIndex === -1) {
 certificateRecords.push(nextCertificate);
 } else {
 certificateRecords[existingIndex] = nextCertificate;
 }

 save();
 return clone(nextCertificate);
 },

 listCertificates: (farmerId?: string, limit = 50) => {
 return certificateRecords
 .filter((certificate) => !farmerId || certificate.farmerId === farmerId)
 .slice(-limit)
 .reverse()
 .map((certificate) => clone(certificate));
 },

 getActiveCertificateForFarmer: (farmerId) => {
 const certificate = [...certificateRecords]
 .reverse()
 .find((record) => record.farmerId === farmerId && record.status === 'issued');

 return certificate ? clone(certificate) : undefined;
 },

 getCertificateByVerificationHash: (verificationHash) => {
 const normalizedHash = verificationHash.trim().toLowerCase();
 const certificate = certificateRecords.find(
 (record) => record.verificationHash.toLowerCase() === normalizedHash
 );

 return certificate ? clone(certificate) : undefined;
 },

 recordConsentRecords: (records) => {
 const existingIds = new Set(consentRecords.map((record) => record.id));
 records.forEach((record) => {
 const nextRecord = clone(record);
 if (!existingIds.has(nextRecord.id)) {
 consentRecords.push(nextRecord);
 existingIds.add(nextRecord.id);
 }
 });
 save();
 },

 listConsentRecords: (filters = {}, limit = 50) => {
 return consentRecords
 .filter((record) => !filters.farmerId || record.farmerId === filters.farmerId)
 .filter((record) => !filters.phoneNumber || record.phoneNumber === filters.phoneNumber)
 .slice(-limit)
 .reverse()
 .map((record) => clone(record));
 },

 linkConsentRecordsToFarmer: (phoneNumber, farmerId) => {
 const updatedRecords: ConsentRecord[] = [];

 consentRecords.forEach((record, index) => {
 if (record.phoneNumber === phoneNumber && !record.farmerId) {
 const nextRecord = {
 ...record,
 farmerId,
 };
 consentRecords[index] = nextRecord;
 updatedRecords.push(nextRecord);
 }
 });

 if (updatedRecords.length > 0) {
 save();
 }

 return updatedRecords.map((record) => clone(record));
 },
 };
};
