-- Throttle MPOB licence guessing during WhatsApp onboarding.
ALTER TABLE whatsapp_sessions
  -- Wrong licence numbers sent since the last lockout.
  ADD COLUMN IF NOT EXISTS mpob_failed_attempts INTEGER NOT NULL DEFAULT 0,
  -- Licence entry is refused until this time after too many wrong attempts.
  ADD COLUMN IF NOT EXISTS mpob_locked_until TIMESTAMPTZ;
