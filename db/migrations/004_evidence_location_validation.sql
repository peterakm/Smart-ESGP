-- Store GPS-to-plot validation outcomes for WhatsApp evidence review.

ALTER TABLE evidence_records
  ADD COLUMN IF NOT EXISTS location_validation JSONB;

CREATE INDEX IF NOT EXISTS idx_evidence_records_location_validation_status
  ON evidence_records((location_validation ->> 'status'));
