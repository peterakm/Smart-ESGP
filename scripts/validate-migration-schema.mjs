import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const migrationsDir = 'db/migrations';
const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => /^\d+_.+\.sql$/.test(file))
  .sort();
const sql = migrationFiles
  .map((file) => readFileSync(path.join(migrationsDir, file), 'utf8'))
  .join('\n');

const requiredTables = [
  'farmers',
  'whatsapp_sessions',
  'whatsapp_provider_message_claims',
  'whatsapp_webhook_events',
  'evidence_records',
  'evidence_reviews',
  'system_audit_events',
  'certificate_records',
  'consent_records',
  'media_files',
];

const requiredColumns = {
  farmers: ['id', 'mpob_licence', 'mspo_cert_id', 'status', 'polygon_waypoints', 'evidence_summary'],
  whatsapp_sessions: ['phone_number', 'farmer_id', 'step', 'pending_location'],
  whatsapp_provider_message_claims: ['provider_message_id', 'status', 'claimed_at', 'claim_expires_at', 'processed_at', 'duplicate_count', 'last_duplicate_at'],
  whatsapp_webhook_events: ['provider_message_id', 'inbound', 'reply', 'outbound', 'session'],
  evidence_records: ['id', 'farmer_id', 'verification_status', 'media_storage', 'review'],
  system_audit_events: ['id', 'service', 'action', 'actor_type', 'entity_type', 'metadata'],
  certificate_records: ['id', 'farmer_id', 'certificate_number', 'verification_hash', 'standard'],
  consent_records: ['id', 'farmer_id', 'phone_number', 'consent_text', 'response_text', 'provider_message_id'],
};

const normalized = sql.toLowerCase();

if (/\b(begin|commit|rollback)\s*;/i.test(sql)) {
  throw new Error('Migration files should not include BEGIN, COMMIT, or ROLLBACK; scripts/run-postgres-migrations.mjs owns the transaction.');
}

for (const table of requiredTables) {
  if (!normalized.includes(`create table if not exists ${table}`)) {
    throw new Error(`Missing table ${table}`);
  }
}

for (const [table, columns] of Object.entries(requiredColumns)) {
  const tableStart = normalized.indexOf(`create table if not exists ${table}`);
  const nextCreate = normalized.indexOf('create table if not exists', tableStart + 1);
  const tableSql = normalized.slice(tableStart, nextCreate === -1 ? undefined : nextCreate);

  for (const column of columns) {
    if (!tableSql.includes(column)) {
      throw new Error(`Missing column ${table}.${column}`);
    }
  }
}

for (const indexName of [
  'idx_evidence_records_farmer_id_created_at',
  'idx_evidence_records_location_validation_status',
  'idx_evidence_records_intake_channel',
  'idx_whatsapp_sessions_identity_status',
  'idx_whatsapp_provider_message_claims_claimed_at',
  'idx_whatsapp_provider_message_claims_status',
  'idx_whatsapp_provider_message_claims_expiry',
  'idx_whatsapp_webhook_events_farmer_id_stored_at',
  'idx_system_audit_events_created_at',
  'idx_certificate_records_verification_hash',
  'idx_consent_records_phone_number',
]) {
  if (!normalized.includes(indexName)) {
    throw new Error(`Missing index ${indexName}`);
  }
}

if (!normalized.includes('create unique index if not exists idx_whatsapp_webhook_events_provider_message_id')) {
  throw new Error('WhatsApp webhook provider message ID index must be unique for idempotency.');
}

if (!normalized.includes('pending_activity')) {
  throw new Error('WhatsApp sessions must persist pending_activity for multi-message evidence classification.');
}

if (!normalized.includes('location_validation')) {
  throw new Error('Evidence records must persist location_validation for GPS-to-plot review triage.');
}

if (!normalized.includes('intake_metadata')) {
  throw new Error('Evidence records must persist intake_metadata for structured WhatsApp submission audits.');
}

if (!normalized.includes('identity_status') || !normalized.includes('identity_conflict')) {
  throw new Error('WhatsApp sessions must persist identity conflict state for FELDA onboarding review.');
}

if (!normalized.includes('pending_photo')) {
  throw new Error('WhatsApp sessions must persist pending_photo so an uncaptioned photo survives until the activity is named.');
}

if (!normalized.includes('pending_survey') || !normalized.includes('photo_reminder_sent_at')) {
  throw new Error('WhatsApp sessions must persist pending_survey and photo_reminder_sent_at so surveys resolve and photo reminders send once.');
}

console.log(JSON.stringify({
  ok: true,
  migrationsDir,
  files: migrationFiles,
  tables: requiredTables.length,
}, null, 2));
