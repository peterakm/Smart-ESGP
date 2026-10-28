-- Claim provider message IDs before webhook side effects so concurrent Meta
-- retry deliveries cannot both generate chatbot replies.

CREATE TABLE IF NOT EXISTS whatsapp_provider_message_claims (
  provider_message_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'processed')),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claim_expires_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  last_duplicate_at TIMESTAMPTZ
);

ALTER TABLE whatsapp_provider_message_claims
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'processed')),
  ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  ADD COLUMN IF NOT EXISTS last_duplicate_at TIMESTAMPTZ;

INSERT INTO whatsapp_provider_message_claims (provider_message_id, status, claimed_at, claim_expires_at, processed_at)
SELECT provider_message_id, 'processed', COALESCE(created_at, stored_at, now()), NULL, stored_at
FROM whatsapp_webhook_events
ON CONFLICT (provider_message_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_whatsapp_provider_message_claims_claimed_at
  ON whatsapp_provider_message_claims(claimed_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_provider_message_claims_status
  ON whatsapp_provider_message_claims(status, claimed_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_provider_message_claims_expiry
  ON whatsapp_provider_message_claims(status, claim_expires_at);
