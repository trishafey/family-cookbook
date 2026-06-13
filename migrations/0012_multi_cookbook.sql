-- Phase 4a-1: Multi-tenant cookbook plumbing (backwards-compatible).
--
-- Adds the data model that lets a single user belong to multiple
-- cookbooks (their personal one, the family one, shared ones).
-- Nothing user-visible changes yet — the existing family cookbook
-- becomes "cookbook #1", every existing recipe/favorite/ai_event
-- backfills to it, and every current family-email member is added
-- to it with editor permission.
--
-- New tables:
--   users            — first-class user identity (created on first
--                      authenticated request once 4b wires
--                      ensureUserBootstrap; pre-seeded here with
--                      the current family allowlist).
--   cookbooks        — the new unit of ownership. visibility ∈
--                      {private, unlisted, public}.
--   cookbook_members — membership + permissions.
--                      role ∈ {owner, editor, viewer}.
--
-- New columns:
--   recipes.cookbook_id   — which cookbook the recipe belongs to.
--   favorites.cookbook_id — denormalised for query speed; derivable
--                           from recipe_id.
--   ai_events.cookbook_id — scopes AI cost/usage per cookbook for
--                           future tier accounting.

-- ─── users ───
CREATE TABLE IF NOT EXISTS users (
  email         TEXT    PRIMARY KEY,
  display_name  TEXT,
  tier          TEXT    NOT NULL DEFAULT 'full',
  status        TEXT    NOT NULL DEFAULT 'approved',
  created_at    TEXT    NOT NULL,
  last_seen_at  TEXT,
  settings_json TEXT
);

-- ─── cookbooks ───
CREATE TABLE IF NOT EXISTS cookbooks (
  id           TEXT    PRIMARY KEY,
  owner_email  TEXT    NOT NULL,
  name         TEXT    NOT NULL,
  slug         TEXT    UNIQUE,
  visibility   TEXT    NOT NULL DEFAULT 'private',
  blurb        TEXT,
  cover_photo  TEXT,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS cookbooks_owner ON cookbooks(owner_email);

-- ─── cookbook_members ───
CREATE TABLE IF NOT EXISTS cookbook_members (
  cookbook_id  TEXT    NOT NULL,
  user_email   TEXT    NOT NULL,
  role         TEXT    NOT NULL,
  invited_by   TEXT,
  joined_at    TEXT    NOT NULL,
  PRIMARY KEY (cookbook_id, user_email)
);
CREATE INDEX IF NOT EXISTS cookbook_members_user ON cookbook_members(user_email);

-- ─── columns on existing tables ───
-- SQLite ALTER TABLE ADD COLUMN doesn't support DEFAULT to a
-- non-constant expression, so we add nullable columns and backfill
-- with UPDATE below.
ALTER TABLE recipes   ADD COLUMN cookbook_id TEXT;
ALTER TABLE favorites ADD COLUMN cookbook_id TEXT;
ALTER TABLE ai_events ADD COLUMN cookbook_id TEXT;
CREATE INDEX IF NOT EXISTS recipes_cookbook   ON recipes(cookbook_id);
CREATE INDEX IF NOT EXISTS favorites_cookbook ON favorites(cookbook_id);

-- ─── bootstrap the family cookbook ───
INSERT OR IGNORE INTO cookbooks (id, owner_email, name, slug, visibility, blurb, created_at, updated_at)
VALUES (
  'family-cookbook',
  'patricia.fejdasz@gmail.com',
  'Heirloom Family Cookbook',
  'family',
  'private',
  'The Fejdasz family cookbook — recipes from Babcia, Patricia, and everyone who cooks for our table.',
  '2026-06-13T00:00:00Z',
  '2026-06-13T00:00:00Z'
);

-- ─── bootstrap users ───
-- Pulled from the current Cloudflare Access allowlist. Tier is
-- 'full' for everyone at launch — tier gating arrives in 4d.
INSERT OR IGNORE INTO users (email, display_name, tier, status, created_at) VALUES
  ('patricia.fejdasz@gmail.com', 'Patricia',    'full', 'approved', '2026-06-13T00:00:00Z'),
  ('gracedygas@gmail.com',       NULL,          'full', 'approved', '2026-06-13T00:00:00Z'),
  ('kay.fejdasz@gmail.com',      NULL,          'full', 'approved', '2026-06-13T00:00:00Z'),
  ('maria.c.chatz@gmail.com',    NULL,          'full', 'approved', '2026-06-13T00:00:00Z'),
  ('rfejdasz@hotmail.com',       NULL,          'full', 'approved', '2026-06-13T00:00:00Z'),
  ('rogerfejdasz@gmail.com',     NULL,          'full', 'approved', '2026-06-13T00:00:00Z'),
  ('singer.irek@gmail.com',      NULL,          'full', 'approved', '2026-06-13T00:00:00Z'),
  ('kayrwojcik@gmail.com',       NULL,          'full', 'approved', '2026-06-13T00:00:00Z'),
  ('jaceywojcik1@gmail.com',     NULL,          'full', 'approved', '2026-06-13T00:00:00Z');

-- ─── bootstrap members ───
-- Patricia is owner; every other current family email is editor.
INSERT OR IGNORE INTO cookbook_members (cookbook_id, user_email, role, joined_at) VALUES
  ('family-cookbook', 'patricia.fejdasz@gmail.com', 'owner',  '2026-06-13T00:00:00Z'),
  ('family-cookbook', 'gracedygas@gmail.com',       'editor', '2026-06-13T00:00:00Z'),
  ('family-cookbook', 'kay.fejdasz@gmail.com',      'editor', '2026-06-13T00:00:00Z'),
  ('family-cookbook', 'maria.c.chatz@gmail.com',    'editor', '2026-06-13T00:00:00Z'),
  ('family-cookbook', 'rfejdasz@hotmail.com',       'editor', '2026-06-13T00:00:00Z'),
  ('family-cookbook', 'rogerfejdasz@gmail.com',     'editor', '2026-06-13T00:00:00Z'),
  ('family-cookbook', 'singer.irek@gmail.com',      'editor', '2026-06-13T00:00:00Z'),
  ('family-cookbook', 'kayrwojcik@gmail.com',       'editor', '2026-06-13T00:00:00Z'),
  ('family-cookbook', 'jaceywojcik1@gmail.com',     'editor', '2026-06-13T00:00:00Z');

-- ─── backfill cookbook_id on existing rows ───
-- All existing recipes/favorites/ai_events belong to the family
-- cookbook. Safe to re-run because the WHERE filters to NULLs only.
UPDATE recipes   SET cookbook_id = 'family-cookbook' WHERE cookbook_id IS NULL;
UPDATE favorites SET cookbook_id = 'family-cookbook' WHERE cookbook_id IS NULL;
UPDATE ai_events SET cookbook_id = 'family-cookbook' WHERE cookbook_id IS NULL;
