-- Track WhatsApp onboarding identity conflicts before a phone is linked to a farmer.
ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS identity_status TEXT
    CHECK (identity_status IN ('unlinked', 'linked', 'conflict')),
  ADD COLUMN IF NOT EXISTS identity_conflict JSONB;

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_identity_status
  ON whatsapp_sessions(identity_status);
