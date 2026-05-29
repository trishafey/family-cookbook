-- Behavioural analytics log. One row per user-driven action
-- (recipe view, add-recipe save, shopping-list action). Used
-- to answer "how is the cookbook actually being used?"
--
-- Distinct from ai_events because the questions are different:
-- ai_events answers "what's it costing me"; user_events answers
-- "what do people do." Different access patterns, different
-- privacy considerations (admins are excluded by default from
-- user_events; they stay in ai_events because that's real money).
--
-- meta is a JSON blob per-event (e.g. {"method":"paste-url"}
-- for add-recipe, {"action":"print"} for shopping-list).
CREATE TABLE IF NOT EXISTS user_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT    NOT NULL,
  user_email   TEXT    NOT NULL,
  event        TEXT    NOT NULL,
  recipe_id    TEXT,
  meta         TEXT
);
CREATE INDEX IF NOT EXISTS user_events_event   ON user_events(event);
CREATE INDEX IF NOT EXISTS user_events_user    ON user_events(user_email);
CREATE INDEX IF NOT EXISTS user_events_created ON user_events(created_at);
