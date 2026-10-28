-- Store the structured WhatsApp intake envelope for each farmer evidence submission.
ALTER TABLE evidence_records
  ADD COLUMN IF NOT EXISTS intake_metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_evidence_records_intake_channel
  ON evidence_records((intake_metadata ->> 'channel'));
