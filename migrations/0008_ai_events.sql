-- AI feature usage log. One row per successful AI call. Used to
-- answer 'which features are most popular and how are people
-- using them' — what they typed, whether they attached a photo,
-- what action the model returned, etc.
--
-- meta is a JSON blob per-feature: each endpoint logs the
-- handful of fields that matter for understanding intent (prompt
-- text, photo count, action kind, error message on failure).
-- Logging is best-effort — c.executionCtx.waitUntil means a
-- failed insert never blocks the response to the user.
CREATE TABLE IF NOT EXISTS ai_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT    NOT NULL,
  user_email   TEXT    NOT NULL,
  feature      TEXT    NOT NULL,
  recipe_id    TEXT,
  ok           INTEGER NOT NULL DEFAULT 1,
  meta         TEXT
);
CREATE INDEX IF NOT EXISTS ai_events_feature ON ai_events(feature);
CREATE INDEX IF NOT EXISTS ai_events_user    ON ai_events(user_email);
CREATE INDEX IF NOT EXISTS ai_events_created ON ai_events(created_at);
