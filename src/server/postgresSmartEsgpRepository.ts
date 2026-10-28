import { Pool, type PoolConfig } from 'pg';
import type { WhatsAppFarmerSession, WhatsAppProviderMessageClaim, WhatsAppWebhookEvent } from '../contracts/whatsapp';
import type { CertificateRecord, ConsentRecord, EvidenceRecord, EvidenceReview, Farmer, SystemAuditEvent } from '../types';
import type { SmartEsgpRepository } from './smartEsgpRepository';

interface PostgresSmartEsgpRepositoryOptions {
 connectionString: string;
 ssl?: boolean;
 schema?: string;
}

type DbRow = Record<string, unknown>;

const limitValue = (limit = 50) => {
 return Math.max(1, Math.min(1000, Math.trunc(Number.isFinite(limit) ? limit : 50)));
};

const toIso = (value: unknown) => {
 if (value instanceof Date) return value.toISOString();
 if (typeof value === 'string') return new Date(value).toISOString();
 return new Date().toISOString();
};

const jsonValue = <T>(value: unknown, fallback: T): T => {
 return value === null || value === undefined ? fallback : value as T;
};

const validateSchemaName = (schema: string) => {
 if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
 throw new Error('SMART_ESGP_POSTGRES_SCHEMA must contain only letters, numbers, and underscores, and must not start with a number.');
 }
 return schema;
};

const mapFarmer = (row: DbRow): Farmer => ({
 id: String(row.id),
 name: String(row.name),
 mpobLicence: String(row.mpob_licence),
 mspoCertId: String(row.mspo_cert_id),
 plotLocation: String(row.plot_location),
 plotArea: Number(row.plot_area),
 polygonWaypoints: jsonValue(row.polygon_waypoints, []),
 score: Number(row.score),
 daysCollected: Number(row.days_collected),
 lastActivityDate: String(row.last_activity_date),
 status: row.status as Farmer['status'],
 post2020Status: row.post_2020_status as Farmer['post2020Status'],
 whispStatus: row.whisp_status as Farmer['whispStatus'],
 pdpaConsent: Boolean(row.pdpa_consent),
 transactionsCount: Number(row.transactions_count),
 actualYield: Number(row.actual_yield),
 annualProjection: Number(row.annual_projection),
 expectedYieldCeiling: Number(row.expected_yield_ceiling),
 whatsappLanguage: row.whatsapp_language as Farmer['whatsappLanguage'],
 onboardingStep: row.onboarding_step as Farmer['onboardingStep'],
 anomalies: jsonValue(row.anomalies, []),
 auditLogs: jsonValue(row.audit_logs, []),
 evidenceSummary: jsonValue(row.evidence_summary, {
 checkIns: 0,
 activities: { harvest: 0, prune: 0, spray: 0, weed: 0, inspect: 0 },
 deliveries: 0,
 }),
});

const farmerColumns = [
 'id',
 'name',
 'mpob_licence',
 'mspo_cert_id',
 'plot_location',
 'plot_area',
 'score',
 'days_collected',
 'last_activity_date',
 'status',
 'post_2020_status',
 'whisp_status',
 'pdpa_consent',
 'transactions_count',
 'actual_yield',
 'annual_projection',
 'expected_yield_ceiling',
 'whatsapp_language',
 'onboarding_step',
 'polygon_waypoints',
 'anomalies',
 'audit_logs',
 'evidence_summary',
];

const farmerValues = (farmer: Farmer) => [
 farmer.id,
 farmer.name,
 farmer.mpobLicence,
 farmer.mspoCertId,
 farmer.plotLocation,
 farmer.plotArea,
 farmer.score,
 farmer.daysCollected,
 farmer.lastActivityDate,
 farmer.status,
 farmer.post2020Status,
 farmer.whispStatus,
 farmer.pdpaConsent,
 farmer.transactionsCount,
 farmer.actualYield,
 farmer.annualProjection,
 farmer.expectedYieldCeiling,
 farmer.whatsappLanguage ?? null,
 farmer.onboardingStep ?? null,
 JSON.stringify(farmer.polygonWaypoints),
 JSON.stringify(farmer.anomalies),
 JSON.stringify(farmer.auditLogs),
 JSON.stringify(farmer.evidenceSummary),
];

const mapSession = (row: DbRow): WhatsAppFarmerSession => ({
 phoneNumber: String(row.phone_number),
 farmerId: typeof row.farmer_id === 'string' ? row.farmer_id : undefined,
 step: row.step as WhatsAppFarmerSession['step'],
 language: row.language as WhatsAppFarmerSession['language'],
 consentVersion: typeof row.consent_version === 'string' ? row.consent_version : undefined,
 consentedAt: row.consented_at ? toIso(row.consented_at) : undefined,
 identityStatus: typeof row.identity_status === 'string'
 ? row.identity_status as WhatsAppFarmerSession['identityStatus']
 : (typeof row.farmer_id === 'string' ? 'linked' : 'unlinked'),
 identityConflict: jsonValue(row.identity_conflict, undefined),
 mpobFailedAttempts: typeof row.mpob_failed_attempts === 'number' && row.mpob_failed_attempts > 0 ? row.mpob_failed_attempts : undefined,
 mpobLockedUntil: row.mpob_locked_until ? toIso(row.mpob_locked_until) : undefined,
 pendingLocation: jsonValue(row.pending_location, undefined),
 pendingActivity: typeof row.pending_activity === 'string' ? row.pending_activity as WhatsAppFarmerSession['pendingActivity'] : undefined,
 pendingPhoto: jsonValue(row.pending_photo, undefined),
 pendingSurvey: row.pending_survey === true || undefined,
 photoReminderSentAt: row.photo_reminder_sent_at ? toIso(row.photo_reminder_sent_at) : undefined,
 createdAt: toIso(row.created_at),
 updatedAt: toIso(row.updated_at),
 lastInboundAt: row.last_inbound_at ? toIso(row.last_inbound_at) : undefined,
});

const mapEvidence = (row: DbRow): EvidenceRecord => {
 const lat = row.location_lat === null || row.location_lat === undefined ? undefined : Number(row.location_lat);
 const lng = row.location_lng === null || row.location_lng === undefined ? undefined : Number(row.location_lng);

 return {
 id: String(row.id),
 farmerId: String(row.farmer_id),
 source: 'whatsapp',
 evidenceType: 'daily_checkin',
 activityType: row.activity_type as EvidenceRecord['activityType'],
 verificationStatus: row.verification_status as EvidenceRecord['verificationStatus'],
 phoneNumber: String(row.phone_number),
 providerMessageId: String(row.provider_message_id),
 mediaId: typeof row.media_id === 'string' ? row.media_id : undefined,
 mimeType: typeof row.mime_type === 'string' ? row.mime_type : undefined,
 location: lat !== undefined && lng !== undefined ? { lat, lng } : undefined,
 receivedAt: toIso(row.received_at),
 createdAt: toIso(row.created_at),
 summary: String(row.summary),
 intake: jsonValue(row.intake_metadata, undefined),
 locationValidation: jsonValue(row.location_validation, undefined),
 mediaStorage: jsonValue(row.media_storage, undefined),
 review: jsonValue(row.review, undefined),
 reviewHistory: jsonValue(row.review_history, []),
 };
};

const mapEvidenceReview = (row: DbRow): EvidenceReview => ({
 status: row.decision as EvidenceReview['status'],
 reviewedBy: typeof row.reviewed_by === 'string' ? row.reviewed_by : undefined,
 reviewedAt: row.reviewed_at ? toIso(row.reviewed_at) : undefined,
 notes: typeof row.notes === 'string' ? row.notes : undefined,
});

const mapAuditEvent = (row: DbRow): SystemAuditEvent => ({
 id: String(row.id),
 service: row.service as SystemAuditEvent['service'],
 action: String(row.action),
 actorType: row.actor_type as SystemAuditEvent['actorType'],
 actorId: typeof row.actor_id === 'string' ? row.actor_id : undefined,
 entityType: row.entity_type as SystemAuditEvent['entityType'],
 entityId: typeof row.entity_id === 'string' ? row.entity_id : undefined,
 severity: row.severity as SystemAuditEvent['severity'],
 message: String(row.message),
 metadata: jsonValue(row.metadata, undefined),
 createdAt: toIso(row.created_at),
});

const mapCertificate = (row: DbRow): CertificateRecord => ({
 id: String(row.id),
 farmerId: String(row.farmer_id),
 certificateNumber: String(row.certificate_number),
 status: row.status as CertificateRecord['status'],
 issuedAt: toIso(row.issued_at),
 expiresAt: toIso(row.expires_at),
 issuedBy: String(row.issued_by),
 verificationHash: String(row.verification_hash),
 scoreAtIssue: Number(row.score_at_issue),
 evidenceDaysAtIssue: Number(row.evidence_days_at_issue),
 standard: row.standard as CertificateRecord['standard'],
});

const mapConsent = (row: DbRow): ConsentRecord => ({
 id: String(row.id),
 farmerId: typeof row.farmer_id === 'string' ? row.farmer_id : undefined,
 phoneNumber: String(row.phone_number),
 consentVersion: String(row.consent_version),
 language: row.language as ConsentRecord['language'],
 consentText: String(row.consent_text),
 responseText: String(row.response_text),
 providerMessageId: String(row.provider_message_id),
 consentedAt: toIso(row.consented_at),
 createdAt: toIso(row.created_at),
});

const mapProviderMessageClaim = (row: DbRow): WhatsAppProviderMessageClaim => ({
 providerMessageId: String(row.provider_message_id),
 status: row.status as WhatsAppProviderMessageClaim['status'],
 claimedAt: toIso(row.claimed_at),
 claimExpiresAt: row.claim_expires_at ? toIso(row.claim_expires_at) : undefined,
 processedAt: row.processed_at ? toIso(row.processed_at) : undefined,
 duplicateCount: Number(row.duplicate_count || 0),
 lastDuplicateAt: row.last_duplicate_at ? toIso(row.last_duplicate_at) : undefined,
});

const whatsappGpsReviewWhere = `
 reply -> 'evidence' -> 'locationValidation' ->> 'status'
 IN ('outside_plot', 'unknown_plot', 'missing_location')
`;

const evidenceReviewStatusExpression = `
 COALESCE(
 review ->> 'status',
 CASE
 WHEN verification_status = 'verified' THEN 'approved'
 WHEN verification_status = 'needs_review' THEN 'flagged'
 ELSE 'pending'
 END
 )
`;

const attachReviewHistory = async (records: EvidenceRecord[], pool: Pool) => {
 if (records.length === 0) return records;

 const result = await pool.query(
 `SELECT evidence_id, decision, reviewed_by, reviewed_at, notes
 FROM evidence_reviews
 WHERE evidence_id = ANY($1::text[])
 ORDER BY created_at ASC, id ASC`,
 [records.map((record) => record.id)]
 );
 const reviewsByEvidenceId = new Map<string, EvidenceReview[]>();

 result.rows.forEach((row) => {
 const evidenceId = String(row.evidence_id);
 const reviews = reviewsByEvidenceId.get(evidenceId) || [];
 reviews.push(mapEvidenceReview(row));
 reviewsByEvidenceId.set(evidenceId, reviews);
 });

 return records.map((record) => {
 const reviewHistory = reviewsByEvidenceId.get(record.id) || (record.review ? [record.review] : []);

 return {
 ...record,
 reviewHistory,
 review: reviewHistory[reviewHistory.length - 1] || record.review,
 };
 });
};

export const createPostgresSmartEsgpRepository = async (
 seedFarmers: Farmer[],
 options: PostgresSmartEsgpRepositoryOptions
): Promise<SmartEsgpRepository> => {
 const poolConfig: PoolConfig = {
 connectionString: options.connectionString,
 ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
 options: options.schema ? `-c search_path=${validateSchemaName(options.schema)},public` : undefined,
 };
 const pool = new Pool(poolConfig);

 const seedIfEmpty = async () => {
 const result = await pool.query('SELECT COUNT(*)::int AS count FROM farmers');
 if (Number(result.rows[0]?.count || 0) > 0) return;

 for (const farmer of seedFarmers) {
 await repository.upsertFarmer(farmer);
 }
 };

 const repository: SmartEsgpRepository = {
 checkHealth: async () => {
 try {
 await pool.query('SELECT 1 AS ok');
 return {
 ok: true,
 message: 'PostgreSQL repository responded to SELECT 1.',
 };
 } catch (error) {
 return {
 ok: false,
 message: error instanceof Error ? error.message : 'PostgreSQL repository health check failed.',
 };
 }
 },

 listFarmers: async () => {
 const result = await pool.query(`SELECT * FROM farmers ORDER BY id ASC`);
 return result.rows.map(mapFarmer);
 },

 getFarmer: async (farmerId) => {
 const result = await pool.query('SELECT * FROM farmers WHERE id = $1', [farmerId]);
 return result.rows[0] ? mapFarmer(result.rows[0]) : undefined;
 },

 hasFarmer: async (farmerId) => {
 const result = await pool.query('SELECT EXISTS(SELECT 1 FROM farmers WHERE id = $1) AS exists', [farmerId]);
 return Boolean(result.rows[0]?.exists);
 },

 getFarmerIndex: async () => {
 const farmers = await repository.listFarmers();
 return new Map(farmers.map((farmer) => [farmer.id, farmer]));
 },

 upsertFarmer: async (farmer) => {
 const placeholders = farmerColumns.map((_, index) => `$${index + 1}`).join(', ');
 const updates = farmerColumns
 .filter((column) => column !== 'id')
 .map((column) => `${column} = EXCLUDED.${column}`)
 .join(', ');
 const result = await pool.query(
 `INSERT INTO farmers (${farmerColumns.join(', ')})
 VALUES (${placeholders})
 ON CONFLICT (id) DO UPDATE SET ${updates}, updated_at = now()
 RETURNING *`,
 farmerValues(farmer)
 );
 return mapFarmer(result.rows[0]);
 },

 recordEvidence: async (records) => {
 for (const record of records) {
 const result = await pool.query(
 `INSERT INTO evidence_records (
 id, farmer_id, source, evidence_type, activity_type, verification_status,
 phone_number, provider_message_id, media_id, mime_type, location_lat,
 location_lng, received_at, summary, intake_metadata, location_validation, media_storage, review, created_at
 ) VALUES (
 $1, $2, $3, $4, $5, $6,
 $7, $8, $9, $10, $11,
 $12, $13, $14, $15, $16, $17, $18, $19
 )
 ON CONFLICT (id) DO NOTHING`,
 [
 record.id,
 record.farmerId,
 record.source,
 record.evidenceType,
 record.activityType,
 record.verificationStatus,
 record.phoneNumber,
 record.providerMessageId,
 record.mediaId ?? null,
 record.mimeType ?? null,
 record.location?.lat ?? null,
 record.location?.lng ?? null,
 record.receivedAt,
 record.summary,
 record.intake ? JSON.stringify(record.intake) : null,
 record.locationValidation ? JSON.stringify(record.locationValidation) : null,
 record.mediaStorage ? JSON.stringify(record.mediaStorage) : null,
 record.review ? JSON.stringify(record.review) : null,
 record.createdAt,
 ]
 );
 if (result.rowCount && record.review) {
 await pool.query(
 `INSERT INTO evidence_reviews (
 evidence_id, decision, reviewed_by, reviewed_at, notes
 ) VALUES ($1, $2, $3, $4, $5)`,
 [
 record.id,
 record.review.status,
 record.review.reviewedBy ?? null,
 record.review.reviewedAt ?? null,
 record.review.notes ?? null,
 ]
 );
 }
 }
 },

 listEvidence: async (farmerId, limit = 50, filters = {}) => {
 const clauses: string[] = [];
 const values: unknown[] = [];

 if (farmerId) {
 values.push(farmerId);
 clauses.push(`farmer_id = $${values.length}`);
 }

 if (filters.review === 'open') {
 clauses.push(`${evidenceReviewStatusExpression} IN ('pending', 'flagged')`);
 }

 if (filters.locationValidationStatus) {
 values.push(filters.locationValidationStatus);
 clauses.push(`location_validation ->> 'status' = $${values.length}`);
 }

 values.push(limitValue(limit));
 const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
 const result = await pool.query(
 `SELECT * FROM evidence_records ${where} ORDER BY created_at DESC LIMIT $${values.length}`,
 values
 );
 return attachReviewHistory(result.rows.map(mapEvidence), pool);
 },

 getEvidence: async (evidenceId) => {
 const result = await pool.query('SELECT * FROM evidence_records WHERE id = $1', [evidenceId]);
 if (!result.rows[0]) return undefined;
 const [record] = await attachReviewHistory([mapEvidence(result.rows[0])], pool);
 return record;
 },

 updateEvidenceReview: async (evidenceId, review, verificationStatus) => {
 const client = await pool.connect();

 try {
 await client.query('BEGIN');
 const result = await client.query(
 `UPDATE evidence_records
 SET review = $2, verification_status = $3
 WHERE id = $1
 RETURNING *`,
 [evidenceId, JSON.stringify(review), verificationStatus]
 );

 if (!result.rows[0]) {
 await client.query('ROLLBACK');
 return undefined;
 }

 await client.query(
 `INSERT INTO evidence_reviews (
 evidence_id, decision, reviewed_by, reviewed_at, notes
 ) VALUES ($1, $2, $3, $4, $5)`,
 [
 evidenceId,
 review.status,
 review.reviewedBy ?? null,
 review.reviewedAt ?? null,
 review.notes ?? null,
 ]
 );
 await client.query('COMMIT');

 const [record] = await attachReviewHistory([mapEvidence(result.rows[0])], pool);
 return record;
 } catch (error) {
 await client.query('ROLLBACK');
 throw error;
 } finally {
 client.release();
 }
 },

 getWhatsAppSession: async (phoneNumber) => {
 const result = await pool.query('SELECT * FROM whatsapp_sessions WHERE phone_number = $1', [phoneNumber]);
 return result.rows[0] ? mapSession(result.rows[0]) : undefined;
 },

 getWhatsAppSessionIndex: async () => {
 const sessions = await repository.listWhatsAppSessions();
 return new Map(sessions.map((session) => [session.phoneNumber, session]));
 },

 listWhatsAppSessions: async () => {
 const result = await pool.query('SELECT * FROM whatsapp_sessions ORDER BY updated_at DESC');
 return result.rows.map(mapSession);
 },

 upsertWhatsAppSession: async (session) => {
 const result = await pool.query(
 `INSERT INTO whatsapp_sessions (
 phone_number, farmer_id, step, language, consent_version, consented_at,
 identity_status, identity_conflict, pending_location, pending_activity, pending_photo, pending_survey, photo_reminder_sent_at, created_at, updated_at, last_inbound_at,
 mpob_failed_attempts, mpob_locked_until
 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
 ON CONFLICT (phone_number) DO UPDATE SET
 farmer_id = EXCLUDED.farmer_id,
 step = EXCLUDED.step,
 language = EXCLUDED.language,
 consent_version = EXCLUDED.consent_version,
 consented_at = EXCLUDED.consented_at,
 identity_status = EXCLUDED.identity_status,
 identity_conflict = EXCLUDED.identity_conflict,
 pending_location = EXCLUDED.pending_location,
 pending_activity = EXCLUDED.pending_activity,
 pending_photo = EXCLUDED.pending_photo,
 pending_survey = EXCLUDED.pending_survey,
 photo_reminder_sent_at = EXCLUDED.photo_reminder_sent_at,
 updated_at = EXCLUDED.updated_at,
 last_inbound_at = EXCLUDED.last_inbound_at,
 mpob_failed_attempts = EXCLUDED.mpob_failed_attempts,
 mpob_locked_until = EXCLUDED.mpob_locked_until
 RETURNING *`,
 [
 session.phoneNumber,
 session.farmerId ?? null,
 session.step,
 session.language ?? null,
 session.consentVersion ?? null,
 session.consentedAt ?? null,
 session.identityStatus ?? (session.farmerId ? 'linked' : 'unlinked'),
 session.identityConflict ? JSON.stringify(session.identityConflict) : null,
 session.pendingLocation ? JSON.stringify(session.pendingLocation) : null,
 session.pendingActivity ?? null,
 session.pendingPhoto ? JSON.stringify(session.pendingPhoto) : null,
 session.pendingSurvey ?? false,
 session.photoReminderSentAt ?? null,
 session.createdAt,
 session.updatedAt,
 session.lastInboundAt ?? null,
 session.mpobFailedAttempts ?? 0,
 session.mpobLockedUntil ?? null,
 ]
 );
 return mapSession(result.rows[0]);
 },

 claimWhatsAppProviderMessageIds: async (providerMessageIds, claimOptions = {}) => {
 const uniqueProviderMessageIds = [...new Set(providerMessageIds.filter(Boolean))];
 if (uniqueProviderMessageIds.length === 0) {
 return new Set();
 }
 const now = claimOptions.now || new Date().toISOString();
 const claimTtlMs = claimOptions.claimTtlMs ?? 5 * 60 * 1000;
 const claimExpiresAt = new Date(new Date(now).getTime() + claimTtlMs).toISOString();

 const result = await pool.query(
 `WITH requested AS (
 SELECT DISTINCT unnest($1::text[]) AS provider_message_id
 )
 INSERT INTO whatsapp_provider_message_claims (
 provider_message_id, status, claimed_at, claim_expires_at
 )
 SELECT requested.provider_message_id, 'claimed', $2, $3
 FROM requested
 WHERE NOT EXISTS (
 SELECT 1
 FROM whatsapp_webhook_events
 WHERE whatsapp_webhook_events.provider_message_id = requested.provider_message_id
 )
 ON CONFLICT (provider_message_id) DO UPDATE SET
 status = 'claimed',
 claimed_at = EXCLUDED.claimed_at,
 claim_expires_at = EXCLUDED.claim_expires_at,
 processed_at = NULL
 WHERE whatsapp_provider_message_claims.status = 'claimed'
 AND (
 whatsapp_provider_message_claims.claim_expires_at IS NULL
 OR whatsapp_provider_message_claims.claim_expires_at <= EXCLUDED.claimed_at
 )
 AND NOT EXISTS (
 SELECT 1
 FROM whatsapp_webhook_events
 WHERE whatsapp_webhook_events.provider_message_id = EXCLUDED.provider_message_id
 )
 RETURNING provider_message_id`,
 [uniqueProviderMessageIds, now, claimExpiresAt]
 );

 return new Set(result.rows.map((row) => String(row.provider_message_id)));
 },

 recordWhatsAppProviderMessageDuplicates: async (providerMessageIds) => {
 const uniqueProviderMessageIds = [...new Set(providerMessageIds.filter(Boolean))];
 if (uniqueProviderMessageIds.length === 0) {
 return;
 }

 await pool.query(
 `UPDATE whatsapp_provider_message_claims
 SET duplicate_count = duplicate_count + 1,
 last_duplicate_at = now()
 WHERE provider_message_id = ANY($1::text[])`,
 [uniqueProviderMessageIds]
 );
 },

 recordWhatsAppEvents: async (events) => {
 for (const event of events) {
 await pool.query(
 `INSERT INTO whatsapp_provider_message_claims (provider_message_id, status, claimed_at, claim_expires_at, processed_at)
 VALUES ($1, 'processed', $2, NULL, $2)
 ON CONFLICT (provider_message_id) DO UPDATE SET
 status = 'processed',
 claim_expires_at = NULL,
 processed_at = EXCLUDED.processed_at`,
 [event.inbound.providerMessageId, event.storedAt]
 );
 await pool.query(
 `INSERT INTO whatsapp_webhook_events (
 provider_message_id, from_phone, farmer_id, inbound_kind, reply_intent,
 outbound_mode, session_step, inbound, reply, outbound, session, stored_at
 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
 ON CONFLICT (provider_message_id) DO NOTHING`,
 [
 event.inbound.providerMessageId,
 event.inbound.fromPhone,
 event.reply.farmerId ?? event.session?.farmerId ?? null,
 event.inbound.kind,
 event.reply.intent,
 event.outbound?.mode ?? null,
 event.session?.step ?? null,
 JSON.stringify(event.inbound),
 JSON.stringify(event.reply),
 event.outbound ? JSON.stringify(event.outbound) : null,
 event.session ? JSON.stringify(event.session) : null,
 event.storedAt,
 ]
 );
 }
 },

 getExistingWhatsAppProviderMessageIds: async (providerMessageIds) => {
 if (providerMessageIds.length === 0) {
 return new Set();
 }

 const result = await pool.query(
 `SELECT provider_message_id
 FROM whatsapp_provider_message_claims
 WHERE provider_message_id = ANY($1::text[])
 UNION
 SELECT provider_message_id
 FROM whatsapp_webhook_events
 WHERE provider_message_id = ANY($1::text[])`,
 [providerMessageIds]
 );
 return new Set(result.rows.map((row) => String(row.provider_message_id)));
 },

 listWhatsAppProviderMessageClaims: async (limit = 25) => {
 const result = await pool.query(
 `SELECT provider_message_id, status, claimed_at, claim_expires_at, processed_at, duplicate_count, last_duplicate_at
 FROM whatsapp_provider_message_claims
 ORDER BY COALESCE(processed_at, last_duplicate_at, claimed_at) DESC
 LIMIT $1`,
 [limitValue(limit)]
 );
 return result.rows.map(mapProviderMessageClaim);
 },

 listWhatsAppEvents: async (limit = 25, filters = {}) => {
 const clauses: string[] = [];
 const values: unknown[] = [];

 if (filters.gpsReview) {
 clauses.push(whatsappGpsReviewWhere);
 }

 if (filters.outboundMode) {
 values.push(filters.outboundMode);
 clauses.push(`outbound_mode = $${values.length}`);
 }

 values.push(limitValue(limit));
 const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
 const result = await pool.query(
 `SELECT inbound, reply, outbound, session, stored_at
 FROM whatsapp_webhook_events
 ${where}
 ORDER BY stored_at DESC
 LIMIT $${values.length}`,
 values
 );
 return result.rows.map((row) => ({
 inbound: jsonValue(row.inbound, {}),
 reply: jsonValue(row.reply, {}),
 outbound: jsonValue(row.outbound, undefined),
 session: jsonValue(row.session, undefined),
 storedAt: toIso(row.stored_at),
 } as WhatsAppWebhookEvent));
 },

 listWhatsAppEventsForFarmer: async (farmerId, limit = 25, filters = {}) => {
 const clauses = ['farmer_id = $1'];
 const values: unknown[] = [farmerId];

 if (filters.gpsReview) {
 clauses.push(whatsappGpsReviewWhere);
 }

 if (filters.outboundMode) {
 values.push(filters.outboundMode);
 clauses.push(`outbound_mode = $${values.length}`);
 }

 values.push(limitValue(limit));
 const result = await pool.query(
 `SELECT inbound, reply, outbound, session, stored_at
 FROM whatsapp_webhook_events
 WHERE ${clauses.join(' AND ')}
 ORDER BY stored_at DESC
 LIMIT $${values.length}`,
 values
 );
 return result.rows.map((row) => ({
 inbound: jsonValue(row.inbound, {}),
 reply: jsonValue(row.reply, {}),
 outbound: jsonValue(row.outbound, undefined),
 session: jsonValue(row.session, undefined),
 storedAt: toIso(row.stored_at),
 } as WhatsAppWebhookEvent));
 },

 recordSystemAuditEvents: async (events) => {
 for (const event of events) {
 await pool.query(
 `INSERT INTO system_audit_events (
 id, service, action, actor_type, actor_id, entity_type, entity_id,
 severity, message, metadata, created_at
 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
 ON CONFLICT (id) DO NOTHING`,
 [
 event.id,
 event.service,
 event.action,
 event.actorType,
 event.actorId ?? null,
 event.entityType,
 event.entityId ?? null,
 event.severity,
 event.message,
 event.metadata ? JSON.stringify(event.metadata) : null,
 event.createdAt,
 ]
 );
 }
 },

 listSystemAuditEvents: async (limit = 50, filters = {}) => {
 const clauses: string[] = [];
 const values: unknown[] = [];

 if (filters.service) {
 values.push(filters.service);
 clauses.push(`service = $${values.length}`);
 }

 if (filters.severity) {
 values.push(filters.severity);
 clauses.push(`severity = $${values.length}`);
 }

 if (filters.entityType) {
 values.push(filters.entityType);
 clauses.push(`entity_type = $${values.length}`);
 }

 if (filters.action) {
 values.push(filters.action);
 clauses.push(`action = $${values.length}`);
 }

 values.push(limitValue(limit));
 const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
 const result = await pool.query(
 `SELECT * FROM system_audit_events ${where} ORDER BY created_at DESC LIMIT $${values.length}`,
 values
 );
 return result.rows.map(mapAuditEvent);
 },

 upsertCertificate: async (certificate) => {
 const result = await pool.query(
 `INSERT INTO certificate_records (
 id, farmer_id, certificate_number, status, issued_at, expires_at,
 issued_by, verification_hash, score_at_issue, evidence_days_at_issue, standard
 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
 ON CONFLICT (id) DO UPDATE SET
 farmer_id = EXCLUDED.farmer_id,
 certificate_number = EXCLUDED.certificate_number,
 status = EXCLUDED.status,
 issued_at = EXCLUDED.issued_at,
 expires_at = EXCLUDED.expires_at,
 issued_by = EXCLUDED.issued_by,
 verification_hash = EXCLUDED.verification_hash,
 score_at_issue = EXCLUDED.score_at_issue,
 evidence_days_at_issue = EXCLUDED.evidence_days_at_issue,
 standard = EXCLUDED.standard,
 updated_at = now()
 RETURNING *`,
 [
 certificate.id,
 certificate.farmerId,
 certificate.certificateNumber,
 certificate.status,
 certificate.issuedAt,
 certificate.expiresAt,
 certificate.issuedBy,
 certificate.verificationHash,
 certificate.scoreAtIssue,
 certificate.evidenceDaysAtIssue,
 certificate.standard,
 ]
 );
 return mapCertificate(result.rows[0]);
 },

 listCertificates: async (farmerId, limit = 50) => {
 const result = farmerId
 ? await pool.query('SELECT * FROM certificate_records WHERE farmer_id = $1 ORDER BY created_at DESC LIMIT $2', [farmerId, limitValue(limit)])
 : await pool.query('SELECT * FROM certificate_records ORDER BY created_at DESC LIMIT $1', [limitValue(limit)]);
 return result.rows.map(mapCertificate);
 },

 getActiveCertificateForFarmer: async (farmerId) => {
 const result = await pool.query(
 `SELECT * FROM certificate_records
 WHERE farmer_id = $1 AND status = 'issued'
 ORDER BY issued_at DESC
 LIMIT 1`,
 [farmerId]
 );
 return result.rows[0] ? mapCertificate(result.rows[0]) : undefined;
 },

 getCertificateByVerificationHash: async (verificationHash) => {
 const result = await pool.query(
 'SELECT * FROM certificate_records WHERE lower(verification_hash) = lower($1) LIMIT 1',
 [verificationHash.trim()]
 );
 return result.rows[0] ? mapCertificate(result.rows[0]) : undefined;
 },

 recordConsentRecords: async (records) => {
 for (const record of records) {
 await pool.query(
 `INSERT INTO consent_records (
 id, farmer_id, phone_number, consent_version, language, consent_text,
 response_text, provider_message_id, consented_at, created_at
 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
 ON CONFLICT (id) DO NOTHING`,
 [
 record.id,
 record.farmerId ?? null,
 record.phoneNumber,
 record.consentVersion,
 record.language,
 record.consentText,
 record.responseText,
 record.providerMessageId,
 record.consentedAt,
 record.createdAt,
 ]
 );
 }
 },

 listConsentRecords: async (filters = {}, limit = 50) => {
 const clauses: string[] = [];
 const values: unknown[] = [];

 if (filters.farmerId) {
 values.push(filters.farmerId);
 clauses.push(`farmer_id = $${values.length}`);
 }

 if (filters.phoneNumber) {
 values.push(filters.phoneNumber);
 clauses.push(`phone_number = $${values.length}`);
 }

 values.push(limitValue(limit));
 const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
 const result = await pool.query(
 `SELECT * FROM consent_records ${where} ORDER BY created_at DESC LIMIT $${values.length}`,
 values
 );
 return result.rows.map(mapConsent);
 },

 linkConsentRecordsToFarmer: async (phoneNumber, farmerId) => {
 const result = await pool.query(
 `UPDATE consent_records
 SET farmer_id = $2
 WHERE phone_number = $1 AND farmer_id IS NULL
 RETURNING *`,
 [phoneNumber, farmerId]
 );
 return result.rows.map(mapConsent);
 },

 close: async () => {
 await pool.end();
 },
 };

 await seedIfEmpty();

 return repository;
};
