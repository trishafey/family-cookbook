// Cookbook API — Cloudflare Worker.
//
// Bindings (see wrangler.jsonc):
//   env.DB     — D1 database (family-cookbook-db)
//   env.ASSETS — static assets in /dist (the React app)
//
// Routes under /api/* are handled here; everything else falls through
// to the static React app.

import { Hono } from "hono";
import { RECIPES as SEED_RECIPES } from "../src/data.js";

// One-time setup key. Used by /api/setup to apply the schema and seed
// the database. Safe to regenerate / remove after first use — the
// endpoint is idempotent so re-running it is harmless, but exposing
// it lets anyone re-seed.
const SETUP_KEY = "3edf1fc3-8cc3-4d77-832b-5072b3e926f7";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS recipes (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  subtitle    TEXT,
  author      TEXT,
  cuisine     TEXT,
  course      TEXT,
  photo       TEXT,
  blob        TEXT NOT NULL,
  created_by  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recipes_created_at ON recipes(created_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id          TEXT PRIMARY KEY,
  recipe_id   TEXT NOT NULL,
  author      TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_comments_recipe ON comments(recipe_id, created_at);

CREATE TABLE IF NOT EXISTS favorites (
  user_email  TEXT NOT NULL,
  recipe_id   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_email, recipe_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);
`;

const app = new Hono();

app.get("/api/recipes", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT blob FROM recipes ORDER BY created_at DESC"
  ).all();
  const recipes = rows.results.map((r) => JSON.parse(r.blob));
  return c.json(recipes);
});

app.get("/api/recipes/:id", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT blob FROM recipes WHERE id = ?"
  ).bind(c.req.param("id")).first();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(JSON.parse(row.blob));
});

app.get("/api/setup", async (c) => {
  if (c.req.query("key") !== SETUP_KEY) {
    return c.json({ error: "forbidden" }, 403);
  }

  await c.env.DB.exec(SCHEMA.replace(/\n/g, " ").trim());

  const now = Date.now();
  const stmts = SEED_RECIPES.map((r) =>
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO recipes
       (id, title, subtitle, author, cuisine, course, photo, blob, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      r.id,
      r.title,
      r.subtitle ?? null,
      r.author ?? null,
      r.cuisine ?? null,
      r.course ?? null,
      r.photo ?? null,
      JSON.stringify(r),
      now,
      now
    )
  );
  await c.env.DB.batch(stmts);

  const { c: recipeCount } = await c.env.DB.prepare(
    "SELECT COUNT(*) AS c FROM recipes"
  ).first();

  return c.json({ ok: true, recipeCount });
});

// Everything else: hand to the static React app.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
