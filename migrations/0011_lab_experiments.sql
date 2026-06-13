-- Lab experiments + cooking preferences.
--
-- Why server-side: experiments used to live in localStorage,
-- which meant the cook lost them when switching from desktop
-- to phone (or got new tablet, cleared cache, etc.). Tied to
-- email so they follow the cook across devices.
--
-- Each experiment carries its full chat history (JSON), the
-- latest draft (JSON), and a status — pending while iterating,
-- promoted after it lands in the cookbook. Light enough to
-- read every experiment at once; the cook typically has
-- single-digit experiments active.
CREATE TABLE IF NOT EXISTS lab_experiments (
  id          TEXT    PRIMARY KEY,
  owner_email TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  blurb       TEXT,
  status      TEXT    NOT NULL DEFAULT 'pending',
  draft_json  TEXT    NOT NULL,
  chat_json   TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS lab_experiments_owner ON lab_experiments(owner_email);
CREATE INDEX IF NOT EXISTS lab_experiments_updated ON lab_experiments(updated_at);

-- Per-user cooking preferences. One row per email. The model
-- folds this into every Lab iteration so the cook doesn't have
-- to repeat "I like things fruit-forward" / "I cook lower-sugar"
-- on every prompt.
--
-- prefs_text is freeform — the cook writes whatever they want.
-- A future version could break this into structured fields
-- (sweetness preference, spice tolerance, dietary restrictions,
-- preferred cuisines) but freeform is the lowest-friction start.
CREATE TABLE IF NOT EXISTS user_prefs (
  user_email  TEXT    PRIMARY KEY,
  prefs_text  TEXT    NOT NULL DEFAULT '',
  updated_at  TEXT    NOT NULL
);
