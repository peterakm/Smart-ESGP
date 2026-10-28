-- Persist in-flight WhatsApp session state that the bot relies on between messages.
ALTER TABLE whatsapp_sessions
  -- Uncaptioned check-in photo held until the farmer names the activity it shows.
  ADD COLUMN IF NOT EXISTS pending_photo JSONB,
  -- Whether the next 1-5 reply answers the post-check-in satisfaction survey.
  ADD COLUMN IF NOT EXISTS pending_survey BOOLEAN NOT NULL DEFAULT false,
  -- When the one-off "send your photo" reminder went out, so the sweep never repeats it.
  ADD COLUMN IF NOT EXISTS photo_reminder_sent_at TIMESTAMPTZ;
