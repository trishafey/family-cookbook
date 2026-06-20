-- ─── IP-based login throttling ───
-- Counts failed login attempts per IP so a brute-force script
-- cycling through emails from one box gets locked out even if
-- it never trips a single per-account limit. Reused on the
-- forgot-password endpoint for the same reason.
CREATE TABLE IF NOT EXISTS login_throttle (
  ip TEXT PRIMARY KEY,
  failure_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_failure_at TEXT NOT NULL
);
