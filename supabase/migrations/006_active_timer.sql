-- Store the active timer in the DB so it syncs across browsers.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS active_timer jsonb DEFAULT NULL;
