-- Daily AI spend tracker. One row per UTC date; the Worker reads it
-- before each AI call and refuses when the day's cost has exceeded
-- the configured cap. cost_cents is incremented after each successful
-- call.
CREATE TABLE IF NOT EXISTS ai_usage (
  date        TEXT PRIMARY KEY,
  cost_cents  INTEGER NOT NULL DEFAULT 0
);
