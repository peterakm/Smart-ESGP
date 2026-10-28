-- Smart-ESGP initial PostgreSQL schema.
-- This migration mirrors the current SmartEsgpRepository contract while keeping
-- room for provider payloads and future certification analytics.

CREATE TABLE IF NOT EXISTS farmers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mpob_licence TEXT NOT NULL UNIQUE,
  mspo_cert_id TEXT NOT NULL,
  plot_location TEXT NOT NULL,
  plot_area NUMERIC(10, 3) NOT NULL CHECK (plot_area >= 0),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  days_collected INTEGER NOT NULL CHECK (days_collected >= 0),
  last_activity_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Eligible soon', 'Certified', 'Inactive', 'Flagged', 'In progress')),
  post_2020_status TEXT NOT NULL CHECK (post_2020_status IN ('Clean', 'Deforested', 'Pending')),
  whisp_status TEXT NOT NULL,
  pdpa_consent BOOLEAN NOT NULL DEFAULT FALSE,
  transactions_count INTEGER NOT NULL DEFAULT 0 CHECK (transactions_count >= 0),
  actual_yield NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (actual_yield >= 0),
  annual_projection NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (annual_projection >= 0),
  expected_yield_ceiling NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (expected_yield_ceiling >= 0),
  whatsapp_language TEXT CHECK (whatsapp_language IN ('BM', 'EN')),
  onboarding_step TEXT CHECK (onboarding_step IN ('language', 'consent', 'mpob', 'completed')),
  polygon_waypoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  anomalies JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  phone_number TEXT PRIMARY KEY,
  farmer_id TEXT REFERENCES farmers(id) ON DELETE SET NULL,
  step TEXT NOT NULL CHECK (step IN ('language', 'consent', 'mpob', 'awaiting_location', 'awaiting_photo', 'active')),
  language TEXT CHECK (language IN ('BM', 'EN')),
  consent_version TEXT,
  consented_at TIMESTAMPTZ,
  pending_location JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  last_inbound_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  provider_message_id TEXT NOT NULL,
  from_phone TEXT NOT NULL,
  farmer_id TEXT REFERENCES farmers(id) ON DELETE SET NULL,
  inbound_kind TEXT NOT NULL,
  reply_intent TEXT NOT NULL,
  outbound_mode TEXT,
  session_step TEXT,
  inbound JSONB NOT NULL,
  reply JSONB NOT NULL,
  outbound JSONB,
  session JSONB,
  stored_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence_records (
  id TEXT PRIMARY KEY,
  farmer_id TEXT NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('whatsapp')),
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('daily_checkin')),
  activity_type TEXT NOT NULL CHECK (activity_type IN ('harvest', 'prune', 'spray', 'weed', 'inspect')),
  verification_status TEXT NOT NULL CHECK (verification_status IN ('received', 'verified', 'needs_review')),
  phone_number TEXT NOT NULL,
  provider_message_id TEXT NOT NULL UNIQUE,
  media_id TEXT,
  mime_type TEXT,
  location_lat NUMERIC(10, 7),
  location_lng NUMERIC(10, 7),
  received_at TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL,
  media_storage JSONB,
  review JSONB,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_reviews (
  id BIGSERIAL PRIMARY KEY,
  evidence_id TEXT NOT NULL REFERENCES evidence_records(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('pending', 'approved', 'rejected', 'flagged')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_audit_events (
  id TEXT PRIMARY KEY,
  service TEXT NOT NULL CHECK (service IN ('dashboard', 'whatsapp')),
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('system', 'farmer', 'auditor', 'api')),
  actor_id TEXT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('service', 'farmer', 'evidence', 'certificate', 'whatsapp_message', 'whatsapp_session')),
  entity_id TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS certificate_records (
  id TEXT PRIMARY KEY,
  farmer_id TEXT NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
  certificate_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('issued', 'suspended', 'revoked', 'expired')),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  issued_by TEXT NOT NULL,
  verification_hash TEXT NOT NULL UNIQUE CHECK (verification_hash ~ '^[a-f0-9]{64}$'),
  score_at_issue INTEGER NOT NULL CHECK (score_at_issue BETWEEN 0 AND 100),
  evidence_days_at_issue INTEGER NOT NULL CHECK (evidence_days_at_issue >= 0),
  standard TEXT NOT NULL CHECK (standard IN ('MSPO-MS2530-2022')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY,
  farmer_id TEXT REFERENCES farmers(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  language TEXT CHECK (language IN ('BM', 'EN')),
  consent_text TEXT NOT NULL,
  response_text TEXT NOT NULL,
  provider_message_id TEXT NOT NULL UNIQUE,
  consented_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media_files (
  id BIGSERIAL PRIMARY KEY,
  evidence_id TEXT REFERENCES evidence_records(id) ON DELETE CASCADE,
  farmer_id TEXT REFERENCES farmers(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT CHECK (size_bytes >= 0),
  sha256 TEXT CHECK (sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
  provider_sha256 TEXT,
  stored_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_farmers_status ON farmers(status);
CREATE INDEX IF NOT EXISTS idx_farmers_mpob_licence ON farmers(mpob_licence);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_farmer_id ON whatsapp_sessions(farmer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_provider_message_id ON whatsapp_webhook_events(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_stored_at ON whatsapp_webhook_events(stored_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_farmer_id_stored_at ON whatsapp_webhook_events(farmer_id, stored_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_records_farmer_id_created_at ON evidence_records(farmer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_records_review_status ON evidence_records((review ->> 'status'));
CREATE INDEX IF NOT EXISTS idx_system_audit_events_created_at ON system_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_audit_events_action ON system_audit_events(action);
CREATE INDEX IF NOT EXISTS idx_certificate_records_farmer_id ON certificate_records(farmer_id);
CREATE INDEX IF NOT EXISTS idx_certificate_records_verification_hash ON certificate_records(verification_hash);
CREATE INDEX IF NOT EXISTS idx_consent_records_farmer_id ON consent_records(farmer_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_phone_number ON consent_records(phone_number);
