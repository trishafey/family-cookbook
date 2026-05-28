// Cookbook API — Cloudflare Worker.
//
// Bindings (see wrangler.jsonc):
//   env.DB     — D1 database (family-cookbook-db)
//   env.IMAGES — R2 bucket (family-cookbook-images), holds uploaded photos
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
  // Fetch recipes and their D1 comments in one query. SQLite's
  // json_group_array lets us build the per-recipe comment list inline
  // so the React app doesn't need a second fetch when opening a
  // detail page. The blob.comments curated notes stay separate (they
  // live inside r.blob and are shown alongside liveComments).
  const rows = await c.env.DB.prepare(
    `SELECT r.blob, COALESCE(json_group_array(
       CASE WHEN c.id IS NULL THEN NULL
            ELSE json_object('id', c.id, 'name', c.author, 'text', c.body, 'created_at', c.created_at)
       END
     ) FILTER (WHERE c.id IS NOT NULL), '[]') AS live_comments
     FROM recipes r
     LEFT JOIN comments c ON c.recipe_id = r.id
     GROUP BY r.id
     ORDER BY r.created_at DESC`
  ).all();
  const recipes = rows.results.map((r) => ({
    ...JSON.parse(r.blob),
    liveComments: JSON.parse(r.live_comments).map(formatComment),
  }));
  return c.json(recipes);
});

function formatComment(c) {
  const d = new Date(c.created_at);
  return {
    id: c.id,
    name: c.name,
    text: c.text,
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  };
}

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

// ─── Admin (Access-protected) ───
// Routes under /api/admin/* are gated by Cloudflare Access. When Access
// is configured for this path, the request reaches the worker only after
// the user has authenticated, and the user's email is in the
// 'cf-access-authenticated-user-email' header. The worker trusts this
// header — Access alone controls who's allowed in.

function authedEmail(c) {
  return c.req.header("cf-access-authenticated-user-email") || null;
}

// JS uses this to check sign-in status. With Accept: application/json,
// Access returns a 401 JSON body when unauthenticated (instead of a
// 302 to login), so fetch sees a clean failure.
app.get("/api/admin/me", (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  return c.json({ email });
});

// Sign-in landing page. The browser navigates here, Access intercepts
// for auth, then this handler 302s back to wherever the user came from.
app.get("/api/admin/login", (c) => {
  const returnTo = c.req.query("return") || "/";
  return c.redirect(returnTo);
});

// Create a new recipe. The draft from the AddRecipe form has the full
// nested shape (ingredients, steps, tips, etc.); we keep that in the
// blob column and lift the indexable fields into their own columns.
app.post("/api/admin/recipes", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);

  const draft = await c.req.json();
  if (!draft?.id || !draft?.title) {
    return c.json({ error: "id and title are required" }, 400);
  }

  const now = Date.now();
  try {
    await c.env.DB.prepare(
      `INSERT INTO recipes
         (id, title, subtitle, author, cuisine, course, photo, blob, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      draft.id,
      draft.title,
      draft.subtitle ?? null,
      draft.author ?? null,
      draft.cuisine ?? null,
      draft.course ?? null,
      draft.photo ?? null,
      JSON.stringify(draft),
      email,
      now,
      now
    ).run();
  } catch (err) {
    // Most common cause: PRIMARY KEY conflict (someone reused an id).
    return c.json({ error: String(err.message || err) }, 409);
  }

  return c.json({ ok: true, id: draft.id });
});

// Update an existing recipe. Partial updates allowed — anything not in
// the body is left alone, except blob which is always replaced with the
// merged result so the UI can read JSON.parse(row.blob) without joining
// the column values back together.
app.patch("/api/admin/recipes/:id", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);

  const id = c.req.param("id");
  const patch = await c.req.json();

  const existing = await c.env.DB.prepare(
    "SELECT blob FROM recipes WHERE id = ?"
  ).bind(id).first();
  if (!existing) return c.json({ error: "not found" }, 404);

  const merged = { ...JSON.parse(existing.blob), ...patch, id };
  const now = Date.now();
  await c.env.DB.prepare(
    `UPDATE recipes
       SET title = ?, subtitle = ?, author = ?, cuisine = ?, course = ?,
           photo = ?, blob = ?, updated_at = ?
     WHERE id = ?`
  ).bind(
    merged.title,
    merged.subtitle ?? null,
    merged.author ?? null,
    merged.cuisine ?? null,
    merged.course ?? null,
    merged.photo ?? null,
    JSON.stringify(merged),
    now,
    id
  ).run();

  return c.json({ ok: true, id });
});

// ─── Comments ───
app.post("/api/admin/recipes/:id/comments", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);

  const body = await c.req.json();
  if (!body?.name?.trim() || !body?.text?.trim()) {
    return c.json({ error: "name and text are required" }, 400);
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO comments (id, recipe_id, author, body, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, c.req.param("id"), body.name.trim(), body.text.trim(), now).run();

  return c.json(formatComment({ id, name: body.name.trim(), text: body.text.trim(), created_at: now }));
});

app.delete("/api/admin/comments/:id", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);

  const res = await c.env.DB.prepare(
    "DELETE FROM comments WHERE id = ?"
  ).bind(c.req.param("id")).run();
  if (!res.meta.changes) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

// ─── Favorites (per signed-in user) ───
app.get("/api/admin/favorites", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const rows = await c.env.DB.prepare(
    "SELECT recipe_id FROM favorites WHERE user_email = ?"
  ).bind(email).all();
  return c.json(rows.results.map(r => r.recipe_id));
});

app.post("/api/admin/favorites/:id", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO favorites (user_email, recipe_id, created_at) VALUES (?, ?, ?)"
  ).bind(email, c.req.param("id"), Date.now()).run();
  return c.json({ ok: true });
});

app.delete("/api/admin/favorites/:id", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  await c.env.DB.prepare(
    "DELETE FROM favorites WHERE user_email = ? AND recipe_id = ?"
  ).bind(email, c.req.param("id")).run();
  return c.json({ ok: true });
});

app.delete("/api/admin/recipes/:id", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);

  const res = await c.env.DB.prepare(
    "DELETE FROM recipes WHERE id = ?"
  ).bind(c.req.param("id")).run();

  if (!res.meta.changes) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

// Upload a recipe photo. Multipart with a single 'file' part; stored in
// R2 keyed by a random id. Returns the URL the React app saves into
// draft.photo.
app.post("/api/admin/uploads", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);

  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "missing 'file' part" }, 400);
  }

  // Cap at 10 MB so a stray full-res ProRAW doesn't blow up the bucket.
  if (file.size > 10 * 1024 * 1024) {
    return c.json({ error: "file too large (max 10 MB)" }, 413);
  }

  const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] || ".jpg").toLowerCase();
  const key = `${crypto.randomUUID()}${ext}`;
  await c.env.IMAGES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  return c.json({ url: `/api/images/${key}`, key });
});

// Serve an uploaded photo from R2. Public — anyone visiting the site
// (signed in or not) can load images.
app.get("/api/images/:key", async (c) => {
  const obj = await c.env.IMAGES.get(c.req.param("key"));
  if (!obj) return c.notFound();

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  // 1 year — keys include a UUID so the URL changes if a photo changes.
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
});

// Everything else: hand to the static React app.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
