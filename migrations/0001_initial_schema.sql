-- Initial schema for the family cookbook.
-- Apply this once via Cloudflare D1 → Console.

CREATE TABLE recipes (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  subtitle    TEXT,
  author      TEXT,
  cuisine     TEXT,
  course      TEXT,
  photo       TEXT,
  blob        TEXT NOT NULL,        -- full recipe JSON; the rich shape lives here
  created_by  TEXT,                 -- Cf-Access email of the adder, NULL for seed rows
  created_at  INTEGER NOT NULL,     -- unix ms
  updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_recipes_created_at ON recipes(created_at DESC);

CREATE TABLE comments (
  id          TEXT PRIMARY KEY,
  recipe_id   TEXT NOT NULL,
  author      TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

CREATE INDEX idx_comments_recipe ON comments(recipe_id, created_at);

CREATE TABLE favorites (
  user_email  TEXT NOT NULL,
  recipe_id   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_email, recipe_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);
