-- Preserve the farmer's stated activity between WhatsApp text/location/photo messages.

ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS pending_activity TEXT
  CHECK (pending_activity IN ('harvest', 'prune', 'spray', 'weed', 'inspect'));
