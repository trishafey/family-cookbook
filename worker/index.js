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
            ELSE json_object('id', c.id, 'name', c.author, 'text', c.body, 'created_at', c.created_at, 'created_by', c.created_by, 'rating', c.rating, 'photo', c.photo)
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
    created_by: c.created_by || null,
    rating: c.rating ?? null,
    photo: c.photo || null,
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

// ─── AI usage analytics ───
// One row per AI call written into ai_events. Best-effort: we use
// c.executionCtx.waitUntil so the insert doesn't block the
// response and a DB failure never breaks the AI surface for the
// cook. Each endpoint logs its feature name + a small JSON
// `meta` payload tuned to the questions we want to ask later
// (which features are most popular; what prompts people are
// typing; whether they attach photos; what action the model
// returned).
//
// PII note: `user_email` is logged because the family cookbook
// is family-scoped (≤ 5 users). If this ever broadens past
// family, swap to a hashed identifier.
function logAiEvent(c, feature, recipeId, meta, ok = true) {
  const email = authedEmail(c);
  if (!email) return;
  const created = new Date().toISOString();
  const metaStr = meta ? JSON.stringify(meta) : null;
  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      "INSERT INTO ai_events (created_at, user_email, feature, recipe_id, ok, meta) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(created, email, feature, recipeId || null, ok ? 1 : 0, metaStr)
      .run()
      .catch((err) => console.error("ai_events insert failed", err))
  );
}

// Pull model name + token usage out of an OpenAI response so the
// meta blob can answer "how much did this call cost?" later. Safe
// against missing fields (gpt-image-1 doesn't return chat-style
// usage; truncated/error responses may omit it entirely).
function aiTokens(result) {
  if (!result) return {};
  const out = {};
  if (result.model) out.model = result.model;
  if (result.usage) out.usage = result.usage;
  return out;
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

// ─── AI usage analytics ───
// Powers the small /admin/ai-usage dashboard. Four datasets:
//   • featureTotals — calls per feature, all-time
//   • userTotals    — calls per user, all-time
//   • recentPrompts — last 20 free-text prompts (adjust + lab)
//   • recentEvents  — last 50 events (any feature)
//
// Each block is wrapped in its own try/catch so a missing table
// (migration not yet applied) returns empty arrays instead of a
// 500 — the page renders a clean "no data yet" state.
app.get("/api/admin/ai-usage", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);

  const safe = async (sql, ...binds) => {
    try {
      const stmt = c.env.DB.prepare(sql);
      const bound = binds.length ? stmt.bind(...binds) : stmt;
      const { results } = await bound.all();
      return results || [];
    } catch (err) {
      console.error("ai-usage query failed", err);
      return [];
    }
  };

  const [featureTotals, userTotals, recentPrompts, recentEvents] = await Promise.all([
    safe(`SELECT feature, COUNT(*) AS n
            FROM ai_events
           GROUP BY feature
           ORDER BY n DESC`),
    safe(`SELECT user_email, COUNT(*) AS n
            FROM ai_events
           GROUP BY user_email
           ORDER BY n DESC`),
    // Free-text prompts come from adjust + lab-iterate + help.
    // We pluck the prompt slice out of the meta JSON.
    safe(`SELECT created_at, user_email, feature,
                 json_extract(meta, '$.prompt') AS prompt
            FROM ai_events
           WHERE feature IN ('adjust', 'lab-iterate', 'help')
             AND json_extract(meta, '$.prompt') IS NOT NULL
           ORDER BY created_at DESC
           LIMIT 20`),
    safe(`SELECT created_at, user_email, feature, recipe_id, meta
            FROM ai_events
           ORDER BY created_at DESC
           LIMIT 50`),
  ]);

  return c.json({ featureTotals, userTotals, recentPrompts, recentEvents });
});

// Create a new recipe. The draft from the AddRecipe form has the full
// ─── AI: translate recipe to the other language on save ───
// Fired after a successful POST or PATCH. The handler doesn't await
// this — it uses ctx.waitUntil so the response returns immediately and
// the translation lands a few seconds later. The next time anyone
// fetches /api/recipes the new translation is part of the row.
//
// Each call is roughly 0.001¢ at gpt-4o-mini rates; the same daily cap
// table guards against runaway. We translate only the user-authored
// fields (title / subtitle / ingredient items / step titles+descriptions
// / tips). Quantities, units, sections, precision, mins, etc. stay
// canonical so the math + scheduler keep working in either language.

const AI_TRANSLATE_SYSTEM_PROMPT = `You are a recipe translator for a family cookbook.

You will receive a recipe written in one language and you must translate the user-authored fields into the target language matching the provided JSON schema.

Rules:
- Translate naturally — match the tone of a warm family cookbook, not a literal machine translation.
- Preserve proper nouns: people's names ("Patricia", "Babcia Krystyna"), brand names ("Bullseye BBQ sauce"), and traditional dish names that don't translate cleanly ("Pierogi", "Goulash").
- Translate descriptive cuisine adjectives ("Italian" → "włoska", "Hungarian" → "węgierska") only when they're being used as descriptors.
- Preserve every detail in step descriptions. Do not summarise.
- Keep the same array lengths for ingredients, steps, and tips as the input.
- For ingredient items, translate only the food name. Adjectives like "medium" / "ripe" / "fresh" should also be translated. Numeric quantities and units stay out of the item text (they're tracked separately).
- For steps, translate both the short title and the long description.`;

const AI_TRANSLATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "subtitle", "ingredients", "steps", "tips"],
  properties: {
    title:    { type: "string" },
    subtitle: { type: ["string", "null"] },
    tips:     { type: "array", items: { type: "string" } },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item"],
        properties: { item: { type: "string" } },
      },
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["t", "d"],
        properties: { t: { type: "string" }, d: { type: "string" } },
      },
    },
  },
};

const LANG_NAME = { en: "English", pl: "Polish" };

async function translateAndStore(env, recipeId, recipe, fromLang, toLang) {
  if (!env.OPENAI_API_KEY || fromLang === toLang) return;

  // Strip down the input so the model only sees what it needs to translate.
  const input = {
    title: recipe.title || "",
    subtitle: recipe.subtitle || "",
    ingredients: (recipe.ingredients || []).map(i => ({ item: i.item || "" })),
    steps: (recipe.steps || []).map(s => ({ t: s.t || "", d: s.d || "" })),
    tips: recipe.tips || [],
  };

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_OPENAI_MODEL,
      messages: [
        { role: "system", content: AI_TRANSLATE_SYSTEM_PROMPT },
        { role: "user", content: `Translate this recipe from ${LANG_NAME[fromLang] || fromLang} to ${LANG_NAME[toLang] || toLang}:\n\n${JSON.stringify(input)}` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "translation", strict: true, schema: AI_TRANSLATE_SCHEMA },
      },
    }),
  });

  if (!openaiRes.ok) {
    console.error("translate failed", openaiRes.status, await openaiRes.text());
    return;
  }

  const result = await openaiRes.json();
  const content = result?.choices?.[0]?.message?.content;
  if (!content) return;

  let parsed;
  try { parsed = JSON.parse(content); }
  catch { console.error("translate returned malformed JSON"); return; }

  // Merge into the existing translations blob — a recipe might have
  // a Polish translation already and we don't want to clobber it
  // with a partial update.
  const existing = await env.DB.prepare("SELECT translations FROM recipes WHERE id = ?").bind(recipeId).first();
  const allTranslations = existing?.translations ? JSON.parse(existing.translations) : {};
  allTranslations[toLang] = parsed;

  await env.DB.prepare("UPDATE recipes SET translations = ? WHERE id = ?")
    .bind(JSON.stringify(allTranslations), recipeId)
    .run();

  // Also update the blob so the next /api/recipes read returns the
  // translation inline alongside the canonical fields.
  const blobRow = await env.DB.prepare("SELECT blob FROM recipes WHERE id = ?").bind(recipeId).first();
  if (blobRow?.blob) {
    const merged = { ...JSON.parse(blobRow.blob), translations: allTranslations };
    await env.DB.prepare("UPDATE recipes SET blob = ? WHERE id = ?")
      .bind(JSON.stringify(merged), recipeId).run();
  }
}

// nested shape (ingredients, steps, tips, etc.); we keep that in the
// blob column and lift the indexable fields into their own columns.
// One-shot Polish backfill for recipes that don't have a translation
// yet. Family member visits this URL once after the translate-on-save
// feature ships; future saves keep themselves in sync. Fires every
// translation in parallel via waitUntil so the response returns fast,
// and the family sees the new translations within ~10 seconds on
// the next refresh.
app.get("/api/admin/translate-missing", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!c.env.OPENAI_API_KEY) {
    return c.json({ error: "OpenAI API key is not configured on this Worker." }, 500);
  }

  const rows = await c.env.DB.prepare(
    "SELECT id, blob, translations FROM recipes"
  ).all();

  const queued = [];
  const skipped = [];
  for (const row of rows.results) {
    const existing = row.translations ? JSON.parse(row.translations) : {};
    if (existing.pl) { skipped.push(row.id); continue; }
    const recipe = JSON.parse(row.blob);
    c.executionCtx.waitUntil(translateAndStore(c.env, row.id, recipe, "en", "pl"));
    queued.push(row.id);
  }

  return c.json({
    ok: true,
    queued: queued.length,
    skipped: skipped.length,
    queuedIds: queued,
    message: `Queued ${queued.length} translation${queued.length === 1 ? "" : "s"}. They'll land in the next /api/recipes refresh within ~10 seconds.`,
  });
});

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

  // Fire-and-forget translation to Polish. The cook doesn't wait for it;
  // the next /api/recipes refresh after a few seconds will include it.
  c.executionCtx.waitUntil(translateAndStore(c.env, draft.id, draft, "en", "pl"));

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
  // Clear translations on every edit — the canonical text may have
  // changed and the stale PL overlay would otherwise sit on top of
  // fresh EN content. translateAndStore below rebuilds it.
  await c.env.DB.prepare(
    `UPDATE recipes
       SET title = ?, subtitle = ?, author = ?, cuisine = ?, course = ?,
           photo = ?, blob = ?, translations = NULL, updated_at = ?
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

  // Re-translate after every edit so Polish stays in sync with the
  // canonical English. Fire-and-forget; the cook's PATCH returns
  // immediately.
  c.executionCtx.waitUntil(translateAndStore(c.env, id, merged, "en", "pl"));

  return c.json({ ok: true, id });
});

// ─── Recovery: restore a recipe from its data.js seed ───
// Used to recover recipes whose canonical blob was clobbered (the
// 'edited-in-PL-stuck-in-PL' bug that pre-dated the canonical-read
// fix). Only works for recipes that exist in SEED_RECIPES — drafts
// and Lab-promoted recipes have no seed to restore from.
app.post("/api/admin/recipes/:id/reset-from-seed", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);

  const id = c.req.param("id");
  const seed = SEED_RECIPES.find(r => r.id === id);
  if (!seed) return c.json({ error: "no seed for this recipe" }, 404);

  const existing = await c.env.DB.prepare("SELECT blob FROM recipes WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "not found" }, 404);

  // Preserve community-added fields (comments, pairings, favorites
  // are stored separately) but reset the authored text + structure
  // back to the original. Wipe translations so PL re-builds from
  // the restored canonical.
  const now = Date.now();
  await c.env.DB.prepare(
    `UPDATE recipes
       SET title = ?, subtitle = ?, author = ?, cuisine = ?, course = ?,
           photo = ?, blob = ?, translations = NULL, updated_at = ?
     WHERE id = ?`
  ).bind(
    seed.title,
    seed.subtitle ?? null,
    seed.author ?? null,
    seed.cuisine ?? null,
    seed.course ?? null,
    seed.photo ?? null,
    JSON.stringify(seed),
    now,
    id,
  ).run();

  c.executionCtx.waitUntil(translateAndStore(c.env, id, seed, "en", "pl"));

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
  const rating = Number.isInteger(body.rating) && body.rating >= 1 && body.rating <= 5 ? body.rating : null;
  const photo = typeof body.photo === "string" && body.photo.startsWith("/api/images/") ? body.photo : null;

  await c.env.DB.prepare(
    "INSERT INTO comments (id, recipe_id, author, body, created_at, created_by, rating, photo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, c.req.param("id"), body.name.trim(), body.text.trim(), now, email, rating, photo).run();

  return c.json(formatComment({ id, name: body.name.trim(), text: body.text.trim(), created_at: now, created_by: email, rating, photo }));
});

// Only the author can remove their own note.
app.delete("/api/admin/comments/:id", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);

  const row = await c.env.DB.prepare(
    "SELECT created_by FROM comments WHERE id = ?"
  ).bind(c.req.param("id")).first();
  if (!row) return c.json({ error: "not found" }, 404);
  if (row.created_by !== email) return c.json({ error: "not your note" }, 403);

  await c.env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(c.req.param("id")).run();
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
// ─── AI: paste-text → recipe draft ───
// Sends the user's pasted text to OpenAI with a strict json_schema
// response format matching the cookbook's recipe shape, so the model
// can't hallucinate extra keys or skip required ones.
//
// The OpenAI account has its own hard billing limit, so we don't
// duplicate that with a local cap. The ai_usage table is left in
// place (writes were removed) in case we want to re-introduce
// tracking later.
const AI_OPENAI_MODEL = "gpt-4o-mini";

const AI_EXTRACT_SYSTEM_PROMPT = `You are a recipe extraction assistant for a family cookbook. The user will paste text containing a recipe — could be an email from a relative, a blog post copy-paste, a screenshot transcript, or freeform notes. Extract the recipe into structured JSON matching the provided schema.

QUANTITIES (critical)
- qty MUST always be a positive number > 0. NEVER return 0.
- "a" / "an" / "one" → qty=1
- "a couple" → qty=2
- "a few" / "several" → qty=3
- "a pinch" / "a dash" → qty=0.25, unit="tsp"
- "a sprinkle" → qty=1, unit="tsp"
- If the recipe says "1 kg" or "2 lb", USE THAT NUMBER as qty and that unit. Do not drop quantities.
- When the recipe is truly silent on a quantity, use your best estimate (default qty=1, unit="" for countable items; qty=1, unit="tbsp" for spreads/sauces).

INTUITIVE / FAMILY-COOK MEASURES (sacred — do NOT replace with a number)
- Many family recipes describe quantities by feel: "by eye", "a glug", "to taste", "a generous splash", "until it looks right", "a handful", "as much as you like", "enough to coat", "a knob of butter".
- When the source uses an intuitive measure, set qtyNote to the verbatim phrase from the source ("by eye", "to taste", "a generous splash") and leave qty=1, unit="" as a structural placeholder.
- DO NOT silently convert intuitive measures to fake precision. A family cook's "to taste" is the recipe; replacing it with "0.5 tsp" loses signal.
- qtyNote is always present in the JSON (the schema requires it) but is the empty string "" when the source gives a concrete measurement.

UNITS
- unit is the measurement unit ONLY (cup, cups, tbsp, tsp, oz, lb, kg, g, ml, L, clove, cloves, can, cans, etc.).
- For countable items without a measurement (e.g. "1 onion", "1 bay leaf", "3 cloves garlic"), put descriptors like "medium", "large", "ripe" inside the item name and use an appropriate count unit OR an empty string.
  - "1 medium onion" → qty=1, unit="", item="medium onion"
  - "3 cloves garlic" → qty=3, unit="clove", item="garlic"
  - "few bay leaves" → qty=3, unit="", item="bay leaves"
  - "2-3 whole allspice berries" → qty=3, unit="", item="whole allspice berries"
- NEVER use literal "unit" as the unit value. Use empty string "" if there is no meaningful unit.

INGREDIENT NOTES
- If the recipe contains a descriptive note about an ingredient (a preferred cut, why this version, an optional substitution), include it in the item name in parentheses OR pull it into tips. Pick whichever reads more naturally. Example: "Pork chunks (best from pork butt; fat keeps the meat tender)".

GROUPING
- Group similar items under the same "grp" (e.g., "Sauce", "Dough", "Filling", "Garnish", "Meat", "Vegetables", "Spices"). Use "Ingredients" only when there is truly one logical group.

TITLE & TAGLINE (the family-cookbook voice)
- title: Polish the title into something inviting that fits an heirloom cookbook. Capitalize each word. Include a regional or stylistic hint if obvious from the recipe ("Hungarian Pork Goulash" rather than "goulash"; "Babcia's Apple Meringue Pie" rather than "apple pie"). Keep it concise (3–6 words).
- subtitle: Write a warm one-line tagline (8–18 words) — what makes this dish memorable, when you'd make it, or how it cooks. Editorial tone, no marketing language. Examples: "Hearty, slow-simmered comfort — the kind of stew everyone reaches for seconds of." or "A Sunday classic, the meat falls apart at the touch of a fork."

STEPS (preserve EVERY detail; just polish the prose)
- The family does not want to lose details. Do NOT drop information, ingredients mentioned in passing, optional steps, temperatures, timings, or any cook's notes from the original.
- DO rewrite the prose so it reads cleanly and warmly. Fix grammar. Replace fragments with full sentences. Reorder when an instruction is buried mid-sentence.
- Keep all the original substance: every quantity, every cue, every conditional ("if you prefer"), every optional addition, every warning ("not too much or it will be bitter").
- PRESERVE INTUITIVE COOKING CUES VERBATIM. Phrases like "until the bone shows", "when you can smell the garlic", "until it looks right", "until the dough springs back when poked", "stir until your arm gets tired", "cook by eye" are signal, not noise — they're how the family teaches the recipe. Keep these phrases word-for-word in the step prose. Do NOT replace them with measured times or temperatures. You may ALSO add a precise estimate alongside ("until the bone shows — usually 40-50 min") but the original phrase stays.
- If the original mentions an ingredient or trick in the step text that wasn't in the ingredient list, keep that mention in the step.
- Each step gets a short title 't' (max 60 chars) summarising the action plus a fuller 'd' description (the polished prose).
- precision: "easy" (set and forget), "medium" (some attention), "careful" (precise), "watch" (don't walk away — heat, browning), "patient" (long wait — rest, rise, marinate).
- mins: your best estimate; for passive steps (rest / marinate / freeze / proof) include the wait time.

DIET (be liberal — apply by exclusion)
- If the recipe does NOT contain wheat / barley / rye / flour / soy sauce → include "Gluten-free".
- If the recipe does NOT contain milk / butter / cheese / cream / yogurt → include "Dairy-free".
- If the recipe does NOT contain nuts → include "Nut-free".
- If the recipe does NOT contain soy / soy sauce / tofu / edamame → include "Soy-free".
- If the recipe is predominantly meat → "Carnivore" and "High protein".
- If carbs (bread, pasta, rice, sugar, potatoes) are absent or minimal → "Low carb".
- If there's no meat / fish / dairy / eggs → "Vegan".
- If there's no meat / fish → "Vegetarian".
- If the only animal product is fish/shellfish → "Pescatarian".

NUTRITION (must provide estimates)
- ALWAYS provide nutrition estimates per serving — even rough.
- cal in calories, protein/carbs/fat/fiber in grams, sodium in milligrams.
- Base your estimate on the ingredients and servings count.

TIPS
- Pull "for best results" / "variations" / "notes" / "tip:" sections into tips as separate short strings.

DEFAULTS
- Default servingsDefault to 4 if not specified.
- Default difficulty to "Easy" if not clear.
- Default course based on the dish (use Dinner when ambiguous and the dish is hearty / main-course).`;

const AI_RECIPE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "subtitle", "author", "cuisine", "course", "occasion", "diet", "prep", "cook", "servingsDefault", "difficulty", "ingredients", "steps", "tips", "nutrition"],
  properties: {
    title:    { type: "string" },
    subtitle: { type: ["string", "null"] },
    author:   { type: ["string", "null"] },
    cuisine:  { type: ["string", "null"] },
    course:   { type: "string", enum: ["Breakfast", "Lunch", "Dinner", "Appetizer", "Dessert", "Snack"] },
    occasion: { type: "string", enum: ["Solo", "Family style", "Date night"] },
    diet:     { type: "array", items: { type: "string" } },
    prep:     { type: "number" },
    cook:     { type: "number" },
    servingsDefault: { type: "number" },
    difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["qty", "unit", "item", "grp", "qtyNote"],
        properties: {
          qty: { type: "number" },
          unit: { type: "string" },
          item: { type: "string" },
          grp: { type: "string" },
          // Verbatim intuitive measure (e.g. "by eye", "a glug",
          // "to taste", "until it looks right"). When present, the
          // cook sees this in place of qty + unit — a family cook's
          // measure is sacred and isn't replaced with a fake number.
          // Empty string when not applicable.
          qtyNote: { type: "string" },
        },
      },
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["t", "d", "mins", "precision"],
        properties: {
          t: { type: "string" },
          d: { type: "string" },
          mins: { type: "number" },
          precision: { type: "string", enum: ["easy", "medium", "careful", "watch", "patient"] },
        },
      },
    },
    tips: { type: "array", items: { type: "string" } },
    nutrition: {
      type: "object",
      additionalProperties: false,
      required: ["cal", "protein", "carbs", "fat", "fiber", "sodium"],
      properties: {
        cal:     { type: "number" },
        protein: { type: "number" },
        carbs:   { type: "number" },
        fat:     { type: "number" },
        fiber:   { type: "number" },
        sodium:  { type: "number" },
      },
    },
  },
};


app.post("/api/admin/ai/extract-text", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);

  if (!c.env.OPENAI_API_KEY) {
    return c.json({ error: "OpenAI API key is not configured on this Worker." }, 500);
  }

  const body = await c.req.json().catch(() => ({}));
  const text = (body?.text || "").trim();
  if (!text) return c.json({ error: "no text provided" }, 400);
  if (text.length > 30000) return c.json({ error: "text too long (max 30000 chars)" }, 413);

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${c.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_OPENAI_MODEL,
      messages: [
        { role: "system", content: AI_EXTRACT_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "recipe", strict: true, schema: AI_RECIPE_SCHEMA },
      },
    }),
  });

  if (!openaiRes.ok) {
    const detail = await openaiRes.text();
    console.error("OpenAI error", openaiRes.status, detail);
    return c.json({ error: `OpenAI returned ${openaiRes.status}. The text may have been hard to parse — try simplifying it or using the manual form.` }, 502);
  }

  const result = await openaiRes.json();
  const content = result?.choices?.[0]?.message?.content;
  if (!content) return c.json({ error: "OpenAI returned no content." }, 502);

  let parsed;
  try { parsed = JSON.parse(content); }
  catch { return c.json({ error: "OpenAI returned malformed JSON." }, 502); }

  logAiEvent(c, "extract-text", null, {
    ...aiTokens(result),
    textLen: text.length,
    title: parsed?.title || null,
  });
  return c.json(parsed);
});

// ─── AI: paste-URL → recipe draft ───
// Same model + schema as extract-text. The worker fetches the URL
// server-side, prefers schema.org/Recipe JSON-LD when the page
// exposes it (most modern recipe sites do), and falls back to
// stripped page text otherwise.
function stripHtmlForRecipe(html) {
  // First, try to pull schema.org Recipe JSON-LD blocks. Sites that
  // publish these give us perfectly clean structured data with no
  // navigation, ads, or comment noise.
  const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const recipes = [];
  for (const m of jsonLdMatches) {
    try {
      const raw = JSON.parse(m[1].trim());
      const candidates = Array.isArray(raw) ? raw : raw["@graph"] ? raw["@graph"] : [raw];
      for (const item of candidates) {
        const type = item?.["@type"];
        if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) {
          recipes.push(item);
        }
      }
    } catch { /* malformed JSON-LD; skip */ }
  }
  if (recipes.length) return "RECIPE_JSON_LD:\n" + JSON.stringify(recipes, null, 2);

  // Fallback: brutally strip the HTML to text. Remove the structural
  // chrome first (nav / header / footer / scripts / styles), then drop
  // remaining tags. Decode the most common HTML entities.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

app.post("/api/admin/ai/extract-url", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);

  if (!c.env.OPENAI_API_KEY) {
    return c.json({ error: "OpenAI API key is not configured on this Worker." }, 500);
  }

  const body = await c.req.json().catch(() => ({}));
  const rawUrl = (body?.url || "").trim();
  if (!rawUrl) return c.json({ error: "no URL provided" }, 400);

  let url;
  try {
    url = new URL(rawUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("non-http");
  } catch {
    return c.json({ error: "That doesn't look like a valid http(s) URL." }, 400);
  }

  // Fetch the page. Some sites 403 the default Workers user agent, so
  // we pretend to be a normal browser. 15-second timeout in case the
  // site is slow.
  let html;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HeirloomCookbook/1.0; +https://heirloomcookbook.net)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en;q=0.9",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!resp.ok) {
      return c.json({ error: `The page returned ${resp.status}. It may be paywalled or blocking automated fetches.` }, 502);
    }
    html = await resp.text();
  } catch (err) {
    return c.json({ error: `Could not fetch the page: ${err?.message || err}` }, 502);
  }

  let cleaned = stripHtmlForRecipe(html);
  if (!cleaned) {
    return c.json({ error: "Couldn't parse any readable text out of that page." }, 422);
  }
  if (cleaned.length > 30000) cleaned = cleaned.slice(0, 30000);

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${c.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: AI_EXTRACT_SYSTEM_PROMPT + `

The user is pulling a recipe from a webpage. The text below was scraped from the page; ignore navigation, ads, comments, related-recipe links, and other unrelated boilerplate. If the text starts with 'RECIPE_JSON_LD:' it is structured schema.org Recipe data — use that directly.`,
        },
        { role: "user", content: `Source URL: ${url.toString()}\n\n${cleaned}` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "recipe", strict: true, schema: AI_RECIPE_SCHEMA },
      },
    }),
  });

  if (!openaiRes.ok) {
    const detail = await openaiRes.text();
    console.error("OpenAI URL extract error", openaiRes.status, detail);
    return c.json({ error: `OpenAI returned ${openaiRes.status}. Try the manual form, or try a different URL.` }, 502);
  }

  const result = await openaiRes.json();
  const content = result?.choices?.[0]?.message?.content;
  if (!content) return c.json({ error: "OpenAI returned no content." }, 502);

  let parsed;
  try { parsed = JSON.parse(content); }
  catch { return c.json({ error: "OpenAI returned malformed JSON." }, 502); }

  // Tuck the source URL into the link field so it lands in the form's
  // "Source link" row automatically — the cook can re-label it if they
  // want.
  parsed.sourceUrl = url.toString();

  logAiEvent(c, "extract-url", null, {
    ...aiTokens(result),
    hostname: url.hostname,
    title: parsed?.title || null,
    usedJsonLd: cleaned.startsWith("RECIPE_JSON_LD:"),
  });
  return c.json(parsed);
});

// ─── AI: photo of a cookbook page → recipe draft ───
// The cook snaps a picture of a recipe card or cookbook spread and
// we ask gpt-4o-mini (vision) to read it and return the same JSON
// shape extract-text returns. We also park the image in R2 and tuck
// its public URL into the response, so the form pre-fills the hero
// photo with the snapshot itself — saves the cook from doing a
// second upload.
app.post("/api/admin/ai/extract-image", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);

  if (!c.env.OPENAI_API_KEY) {
    return c.json({ error: "OpenAI API key is not configured on this Worker." }, 500);
  }

  const form = await c.req.formData().catch(() => null);
  const files = form ? form.getAll("file").filter(f => f instanceof File) : [];
  if (!files.length) return c.json({ error: "missing 'file' part" }, 400);

  // Cap the batch so a careless 12-page upload doesn't OOM the Worker
  // (128 MB heap) — base64 expands by ~33% and we keep every image
  // in memory at once.
  const MAX_FILES = 6;
  const MAX_BYTES_PER_FILE = 8 * 1024 * 1024;
  if (files.length > MAX_FILES) {
    return c.json({ error: `Too many images (max ${MAX_FILES}).` }, 413);
  }
  for (const f of files) {
    if (!f.type.startsWith("image/")) return c.json({ error: `'${f.name || "file"}' isn't an image.` }, 415);
    if (f.size > MAX_BYTES_PER_FILE) return c.json({ error: `'${f.name || "file"}' is over 8 MB.` }, 413);
  }

  // For each upload: read bytes once, R2-tee in parallel, base64 for
  // the vision call. R2 failure is a soft fail per-file — the
  // extraction still runs, the photo just won't be preserved.
  const prepared = await Promise.all(files.map(async (file) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = (file.name?.match(/\.[a-z0-9]+$/i)?.[0] || ".jpg").toLowerCase();
    const key = `${crypto.randomUUID()}${ext}`;
    let photoUrl = null;
    try {
      await c.env.IMAGES.put(key, bytes, {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
      });
      photoUrl = `/api/images/${key}`;
    } catch (err) {
      console.error("R2 put failed during extract-image", err);
    }

    // btoa() in Workers is limited to latin-1 strings, so we chunk
    // through a binary string to avoid blowing the call stack on
    // multi-MB images.
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    const dataUrl = `data:${file.type};base64,${btoa(bin)}`;
    return { photoUrl, dataUrl };
  }));

  const sourcePhotos = prepared.map(p => p.photoUrl).filter(Boolean);
  const userText = files.length === 1
    ? "Extract the recipe from this photo."
    : `Extract the recipe from these ${files.length} photos. They are different pages or sides of the same recipe — stitch them into one.`;

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${c.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: AI_EXTRACT_SYSTEM_PROMPT + `

The user has photographed a cookbook page, recipe card, or handwritten note. They may attach more than one photo for a single recipe — e.g. the front and back of a 3x5 card, or two cookbook pages that continue across a spread. Read every photo, including handwriting, and stitch them into one recipe. If the photos show multiple unrelated recipes, focus on the most prominent one. If they show none, return an empty title and let the cook fix it manually.`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            ...prepared.map(p => ({ type: "image_url", image_url: { url: p.dataUrl, detail: "high" } })),
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "recipe", strict: true, schema: AI_RECIPE_SCHEMA },
      },
    }),
  });

  if (!openaiRes.ok) {
    const detail = await openaiRes.text();
    console.error("OpenAI image extract error", openaiRes.status, detail);
    return c.json({ error: `OpenAI returned ${openaiRes.status}. The photo may be hard to read — try a closer or sharper shot, or use the manual form.` }, 502);
  }

  const result = await openaiRes.json();
  const content = result?.choices?.[0]?.message?.content;
  if (!content) return c.json({ error: "OpenAI returned no content." }, 502);

  let parsed;
  try { parsed = JSON.parse(content); }
  catch { return c.json({ error: "OpenAI returned malformed JSON." }, 502); }

  // The snapshots stay attached to the recipe as sourcePhotos so the
  // family can flip on "show the original" on the recipe page. We do
  // NOT promote one of them to .photo — the hero stays whatever the
  // cook picks via the regular Upload Photo control. Default
  // showSourcePhotos to true so the reveal lights up automatically;
  // the cook can flip it off in the editor.
  if (sourcePhotos.length) {
    parsed.sourcePhotos = sourcePhotos;
    parsed.showSourcePhotos = true;
  }

  logAiEvent(c, "extract-image", null, {
    ...aiTokens(result),
    photoCount: sourcePhotos.length,
    title: parsed?.title || null,
  });
  return c.json(parsed);
});

// ─── AI: pairings — "Goes great with…" ───
// Given a recipe, ask the model for two things in one call:
//   1. fromBook — up to 4 IDs from the cookbook the AI thinks would
//      pair well as sides/desserts/sauces. We pass the cookbook
//      catalogue in the user message so the AI picks from real IDs.
//   2. suggestions — 2-3 NEW companion recipes the family doesn't
//      have yet (a sauce, a side, a drink). Same shape as the
//      hand-curated PAIRINGS entries in pairings.jsx, so the React
//      side renders them with the existing tiles.
// The result is cached on the recipe blob as recipe.pairings so the
// AI call happens once per recipe — subsequent visitors get the
// stored copy for free. Regenerate with ?force=1.
const AI_PAIRINGS_SCHEMA = {
  type: "object",
  properties: {
    fromBook: { type: "array", items: { type: "string" } },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title:      { type: "string" },
          kind:       { type: "string", enum: ["Side", "Sauce", "Drink", "Dessert", "Topping", "Garnish", "Snack"] },
          blurb:      { type: "string" },
          time:       { type: "number" },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                qty:  { type: "number" },
                unit: { type: "string" },
                item: { type: "string" },
              },
              required: ["qty", "unit", "item"],
              additionalProperties: false,
            },
          },
          steps:      { type: "array", items: { type: "string" } },
          photoTone:  { type: "string" },
        },
        required: ["title", "kind", "blurb", "time", "ingredients", "steps", "photoTone"],
        additionalProperties: false,
      },
    },
  },
  required: ["fromBook", "suggestions"],
  additionalProperties: false,
};

app.post("/api/admin/ai/pairings", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!c.env.OPENAI_API_KEY) {
    return c.json({ error: "OpenAI API key is not configured on this Worker." }, 500);
  }

  const body = await c.req.json().catch(() => ({}));
  const recipeId = (body?.recipeId || "").trim();
  const force = !!body?.force;
  // Pinned suggestions the caller wants preserved across a
  // regenerate. We trust the client's copy verbatim (it's just the
  // same JSON we returned last time, plus a pinned flag), strip out
  // anything that doesn't look like a suggestion, and cap at 3 so a
  // misbehaving client can't fill the whole response with junk.
  const keepSuggestions = Array.isArray(body?.keepSuggestions)
    ? body.keepSuggestions.filter(s => s && typeof s.title === "string").slice(0, 3)
    : [];
  // Pinned in-book IDs the caller wants forced into fromBook. We
  // validate against the catalogue further down to drop anything
  // that doesn't actually exist.
  const keepFromBook = Array.isArray(body?.keepFromBook)
    ? body.keepFromBook.filter(s => typeof s === "string").slice(0, 4)
    : [];
  if (!recipeId) return c.json({ error: "missing recipeId" }, 400);

  const row = await c.env.DB.prepare("SELECT blob FROM recipes WHERE id = ?").bind(recipeId).first();
  if (!row) return c.json({ error: "recipe not found" }, 404);
  const recipe = JSON.parse(row.blob);

  // If pairings are already cached and the caller didn't force, hand
  // back the cached copy — no AI call, no cap hit. Family members
  // visiting after the first generation get instant pairings.
  if (recipe.pairings && !force) {
    return c.json({ ...recipe.pairings, cached: true });
  }

  // Build a compact catalogue of other recipes for the AI to pick
  // from. We only send the fields the AI needs to judge a pairing —
  // ingredients/steps aren't necessary and would bloat the prompt.
  const catalogueRows = await c.env.DB.prepare(
    "SELECT blob FROM recipes WHERE id != ?"
  ).bind(recipeId).all();
  const catalogue = catalogueRows.results.map(r => {
    const b = JSON.parse(r.blob);
    return {
      id: b.id,
      title: b.title,
      course: b.course,
      cuisine: b.cuisine,
      subtitle: b.subtitle || "",
    };
  });

  // Trim the target down to what the model needs to reason about
  // pairings — full ingredient list (so it can avoid duplicating
  // flavours) plus identity / mood fields.
  const target = {
    title:    recipe.title,
    subtitle: recipe.subtitle || "",
    course:   recipe.course,
    cuisine:  recipe.cuisine,
    occasion: recipe.occasion,
    diet:     recipe.diet || [],
    ingredients: (recipe.ingredients || []).map(i => `${i.qty || ""} ${i.unit || ""} ${i.item}`.trim()),
  };

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${c.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `You suggest food pairings for a family cookbook. Given a target recipe and a catalogue of other recipes in the same cookbook, return two lists:

1. fromBook: up to 4 RECIPE IDs (taken EXACTLY from the catalogue's "id" field — do not invent ids) that would complement the target as sides, sauces, drinks, or desserts. Prefer Sides for mains, and lighter items for rich dishes. Leave empty if nothing in the catalogue fits well.

2. suggestions: ${Math.max(1, 3 - keepSuggestions.length)} NEW pairing ideas not already in the cookbook — sauces, sides, garnishes, drinks, or simple desserts that would round out the meal. Each must include realistic ingredients (qty + unit + item), 3-5 concise plain-text steps, a kind from the allowed enum, a one-sentence blurb that explains why it pairs, an approximate total time in minutes, and a photoTone hex colour that visually fits the dish (e.g. "#b04a2a" for tomato-forward, "#6e7a3a" for herby).${
            keepSuggestions.length
              ? ` IMPORTANT: the cook has already pinned ${keepSuggestions.length} suggestion(s) — listed under PINNED below — that will be kept verbatim alongside your output. Generate fresh ideas that are NOT duplicates of or close variations on the pinned ones.`
              : ""
          }

Quality bar: a thoughtful family cook should look at these and immediately understand why each pairing makes sense.`,
        },
        {
          role: "user",
          content: `TARGET RECIPE:\n${JSON.stringify(target, null, 2)}\n\nCATALOGUE OF OTHER COOKBOOK RECIPES:\n${JSON.stringify(catalogue, null, 2)}${
            keepFromBook.length
              ? `\n\nPINNED IN-BOOK IDS (already locked in by the cook — pick different recipes to complement these, do not repeat):\n${JSON.stringify(keepFromBook)}`
              : ""
          }${
            keepSuggestions.length
              ? `\n\nPINNED SUGGESTIONS (already in the response — do not repeat):\n${JSON.stringify(keepSuggestions.map(s => ({ title: s.title, kind: s.kind, blurb: s.blurb })), null, 2)}`
              : ""
          }`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "pairings", strict: true, schema: AI_PAIRINGS_SCHEMA },
      },
    }),
  });

  if (!openaiRes.ok) {
    const detail = await openaiRes.text();
    console.error("OpenAI pairings error", openaiRes.status, detail);
    return c.json({ error: `OpenAI returned ${openaiRes.status}.` }, 502);
  }

  const result = await openaiRes.json();
  const content = result?.choices?.[0]?.message?.content;
  if (!content) return c.json({ error: "OpenAI returned no content." }, 502);

  let parsed;
  try { parsed = JSON.parse(content); }
  catch { return c.json({ error: "OpenAI returned malformed JSON." }, 502); }

  // Guard against the model hallucinating ids that aren't in the
  // catalogue (rare with strict schema + clear instructions, but the
  // schema can't enforce membership).
  const validIds = new Set(catalogue.map(r => r.id));
  parsed.fromBook = (parsed.fromBook || []).filter(id => validIds.has(id));

  // Force pinned in-book IDs to the front of fromBook (validated
  // against the catalogue, deduped against AI picks).
  if (keepFromBook.length) {
    const validKept = keepFromBook.filter(id => validIds.has(id));
    const aiPicks = parsed.fromBook.filter(id => !validKept.includes(id));
    parsed.fromBook = [...validKept, ...aiPicks].slice(0, 4);
  }

  // Pinned suggestions come first so the order stays stable
  // across regenerates (the cook's pinned tiles don't shuffle).
  if (keepSuggestions.length) {
    parsed.suggestions = [
      ...keepSuggestions,
      ...(parsed.suggestions || []),
    ].slice(0, 5);
  }

  // Persist on the recipe blob so subsequent visitors get the
  // cached copy without another AI call.
  parsed.generatedAt = new Date().toISOString();
  const updatedBlob = JSON.stringify({ ...recipe, pairings: parsed });
  await c.env.DB.prepare("UPDATE recipes SET blob = ? WHERE id = ?")
    .bind(updatedBlob, recipeId)
    .run();

  logAiEvent(c, "pairings", recipeId, {
    ...aiTokens(result),
    fromBookCount: parsed.fromBook?.length || 0,
    suggestionsCount: parsed.suggestions?.length || 0,
    keptPins: keepFromBook.length + keepSuggestions.length,
  });
  return c.json({ ...parsed, cached: false });
});

// ─── AI: Need help — multi-turn cook-side assistant ───
// Used by the in-page "Need help?" panel and by cook mode. The
// caller sends the recipe, the live cook-state (current step,
// scaled servings, any adjustments already applied) and a
// conversation history. The model replies with a single
// assistant turn — short, practical, written in a warm cook
// voice. No structured output: it's free-form prose.
app.post("/api/admin/ai/help", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!c.env.OPENAI_API_KEY) return c.json({ error: "OpenAI API key not configured." }, 500);

  const body = await c.req.json().catch(() => ({}));
  const recipe = body?.recipe;
  if (!recipe?.title) return c.json({ error: "missing recipe" }, 400);
  const turns = Array.isArray(body?.turns) ? body.turns.slice(-12) : [];
  if (!turns.length) return c.json({ error: "no question" }, 400);

  // Compact context for the model — full ingredient list (with the
  // cook's current scaled qty, so suggestions match what's actually
  // in front of them), step titles for orientation, plus live
  // cook-state hints if present.
  const context = {
    title:    recipe.title,
    subtitle: recipe.subtitle || "",
    cuisine:  recipe.cuisine,
    course:   recipe.course,
    servings: body?.servings ?? recipe.servingsDefault,
    weight:   body?.weight ?? null,
    ingredients: (recipe.ingredients || []).map(i => `${i.qty ?? ""} ${i.unit ?? ""} ${i.item}`.trim()),
    steps:    (recipe.steps || []).map((s, i) => `${i + 1}. ${s.t || s.d?.slice(0, 60)}`),
    currentStep: body?.currentStep
      ? `Cook is currently on step "${body.currentStep.t}" — ${body.currentStep.d}`
      : null,
    appliedAdjustments: Array.isArray(body?.appliedAdjustments) && body.appliedAdjustments.length
      ? body.appliedAdjustments.map(a => a.summary || a.prompt).filter(Boolean)
      : null,
  };

  const messages = [
    {
      role: "system",
      content: `You are the kitchen-side AI helper inside a family cookbook. The cook is mid-recipe and needs a practical answer fast. Reply in 2-4 short paragraphs, plain prose, written like a thoughtful family cook giving real advice — not a list of caveats. Reference the recipe's actual ingredients and the cook's current step or servings when it helps. If the cook hasn't told you which ingredient/step they mean, ask ONE focused clarifying question first. Never invent ingredients that aren't in the recipe.`,
    },
    {
      role: "user",
      content: `RECIPE CONTEXT:\n${JSON.stringify(context, null, 2)}`,
    },
    ...turns.map(t => ({
      role: t.role === "ai" ? "assistant" : "user",
      content: t.text,
    })),
  ];

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${c.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: AI_OPENAI_MODEL, messages }),
  });
  if (!openaiRes.ok) {
    console.error("OpenAI help error", openaiRes.status, await openaiRes.text());
    return c.json({ error: `OpenAI returned ${openaiRes.status}.` }, 502);
  }
  const result = await openaiRes.json();
  const answer = result?.choices?.[0]?.message?.content;
  if (!answer) return c.json({ error: "OpenAI returned no content." }, 502);
  const lastUserTurn = [...turns].reverse().find(t => t.role === "user");
  logAiEvent(c, "help", recipe?.id || null, {
    ...aiTokens(result),
    turnCount: turns.length,
    prompt: (lastUserTurn?.text || "").slice(0, 200),
    fromCookMode: !!body?.cookState,
  });
  return c.json({ answer });
});

// ─── AI: Adjust with AI — free-text recipe tweaks ───
// The cook types something like "halve it" or "make it dairy-free"
// or "I only have 1 lb of beef". The model returns a short prose
// summary plus an optional structured action the client applies
// (setServings / setWeight / setCalTarget). Chips on the client
// still apply their own concrete adjustments — this endpoint
// powers the free-text path.
const AI_ADJUST_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    action: {
      type: ["object", "null"],
      properties: {
        kind:  { type: "string", enum: ["setServings", "setWeight", "setCalTarget", "none"] },
        value: { type: ["number", "null"] },
      },
      required: ["kind", "value"],
      additionalProperties: false,
    },
  },
  required: ["summary", "action"],
  additionalProperties: false,
};

app.post("/api/admin/ai/adjust", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!c.env.OPENAI_API_KEY) return c.json({ error: "OpenAI API key not configured." }, 500);

  const body = await c.req.json().catch(() => ({}));
  const recipe = body?.recipe;
  const prompt = (body?.prompt || "").trim();
  if (!recipe?.title || !prompt) return c.json({ error: "missing recipe or prompt" }, 400);

  const context = {
    title:    recipe.title,
    cuisine:  recipe.cuisine,
    diet:     recipe.diet || [],
    nutrition: recipe.nutrition || null,
    scaleBy:  recipe.scaleBy || "servings",
    servings: body?.servings ?? recipe.servingsDefault,
    weight:   body?.weight ?? null,
    weightUnit: recipe.weightUnit || "lb",
    cookMinsPerLb: recipe.cookMinsPerLb || null,
    ingredients: (recipe.ingredients || []).map(i => `${i.qty ?? ""} ${i.unit ?? ""} ${i.item}`.trim()),
  };

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${c.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: AI_OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `You adapt family-cookbook recipes on the fly. Given a recipe and a free-text request, return:
1. summary — 1-3 sentences, written like a cook giving real advice. Explain what to change and why.
2. action — exactly one structured change the app should auto-apply, OR { kind: "none", value: null } if the request is purely advice (substitutions, technique tips, etc.).

Valid actions:
  • setServings (only if recipe.scaleBy is "servings") — integer servings
  • setWeight (only if recipe.scaleBy is "weight") — number in the recipe's weightUnit
  • setCalTarget — integer target calories per serving
  • none — for advice-only answers

Interpret loosely: "halve it" → set to half current servings (or weight). "Double it" → 2x. "I only have 1.5 lb" → setWeight 1.5. "Lower cals by 30%" → setCalTarget 70% of recipe.nutrition.cal.`,
        },
        {
          role: "user",
          content: `RECIPE:\n${JSON.stringify(context, null, 2)}\n\nCOOK SAID: ${prompt}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "adjust", strict: true, schema: AI_ADJUST_SCHEMA },
      },
    }),
  });
  if (!openaiRes.ok) {
    console.error("OpenAI adjust error", openaiRes.status, await openaiRes.text());
    return c.json({ error: `OpenAI returned ${openaiRes.status}.` }, 502);
  }
  const result = await openaiRes.json();
  const content = result?.choices?.[0]?.message?.content;
  if (!content) return c.json({ error: "OpenAI returned no content." }, 502);
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { return c.json({ error: "OpenAI returned malformed JSON." }, 502); }
  logAiEvent(c, "adjust", recipe?.id || null, {
    ...aiTokens(result),
    prompt: prompt.slice(0, 200),
    actionKind: parsed?.action?.kind || "none",
    actionValue: parsed?.action?.value ?? null,
  });
  return c.json(parsed);
});

// ─── AI: Adjust chips — recipe-specific suggestions ───
// Until Phase 2 of Adjust (full per-user variants) ships, the
// chips are content-aware suggestions: each chip is a relevant
// tweak the cook might try ("Make it dairy-free" for a cream
// pasta; "Add chipotle for depth" for a chili) with a one-
// sentence cooking tip the cook applies as a "Family says"-style
// note. Generic chips (scaling, calorie target) stay on the
// client where they apply locally with no AI needed.
//
// Cached on recipe.aiAdjustChips so every visitor after the
// first gets the cached set. Regenerate with ?force.
const AI_ADJUST_CHIPS_SCHEMA = {
  type: "object",
  properties: {
    chips: {
      type: "array",
      items: {
        type: "object",
        properties: {
          // 3-5 word button text. Imperative, no full stop.
          label:   { type: "string" },
          // 1-sentence prompt the cook would type. Phase 2 will
          // feed this back to the rewrite endpoint.
          prompt:  { type: "string" },
          // 1-2 sentences of concrete cooking guidance — exact
          // substitution, technique, ratio. Shown to the cook as
          // a 'tip' in the applied list when the chip is clicked.
          summary: { type: "string" },
        },
        required: ["label", "prompt", "summary"],
        additionalProperties: false,
      },
    },
  },
  required: ["chips"],
  additionalProperties: false,
};

app.post("/api/admin/ai/adjust-chips", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!c.env.OPENAI_API_KEY) return c.json({ error: "OpenAI API key not configured." }, 500);

  const body = await c.req.json().catch(() => ({}));
  const recipeId = (body?.recipeId || "").trim();
  const force = !!body?.force;
  if (!recipeId) return c.json({ error: "missing recipeId" }, 400);

  const row = await c.env.DB.prepare("SELECT blob FROM recipes WHERE id = ?").bind(recipeId).first();
  if (!row) return c.json({ error: "recipe not found" }, 404);
  const recipe = JSON.parse(row.blob);

  if (recipe.aiAdjustChips && !force) {
    return c.json({ ...recipe.aiAdjustChips, cached: true });
  }

  // Compact context — title, blurb, course, cuisine, diet tags
  // already applied, ingredient item names, step titles. We omit
  // qty/unit because the chips are about content changes (swap,
  // technique) not scaling.
  const context = {
    title:    recipe.title,
    subtitle: recipe.subtitle,
    course:   recipe.course,
    cuisine:  recipe.cuisine,
    diet:     recipe.diet || [],
    ingredients: (recipe.ingredients || []).map(i => i.item).filter(Boolean),
    steps:    (recipe.steps || []).map(s => s.t || (s.d || "").slice(0, 80)).filter(Boolean),
    tips:     recipe.tips || [],
  };

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${c.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: AI_OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `You propose 4-6 relevant adjustments for a specific recipe. Each chip is a tweak the cook might realistically want to try, grounded in what this dish actually contains and how it's cooked.

Selection rules:
  • Tailor to the dish. A roast chicken can be spatchcocked or wet-brined; a pasta can be made gluten-free; a chocolate cake can lose the dairy. Skip suggestions that don't apply (no "make it gluten-free" for a roast that's already GF).
  • If recipe.diet already lists "Gluten-free" or "Dairy-free", don't suggest making it so — the cook already did.
  • Avoid scaling chips ("Make for 8 servings"). Those are handled separately on the client. Focus on content changes: ingredient swaps, technique shifts, flavour pushes, dietary adaptations.
  • Mix easy wins (one swap) with bolder pushes (technique change, new accent).

Each chip has:
  • label — 3-5 imperative words, no full stop ("Make it gluten-free", "Add miso depth", "Spatchcock the bird")
  • prompt — one sentence the cook would type to request this change
  • summary — 1-2 sentences of concrete cooking guidance: what to swap to, how much, what shifts as a consequence (cook time, texture). Written like a family cook giving advice.`,
        },
        { role: "user", content: JSON.stringify(context, null, 2) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "adjust_chips", strict: true, schema: AI_ADJUST_CHIPS_SCHEMA },
      },
    }),
  });
  if (!openaiRes.ok) {
    console.error("OpenAI adjust-chips error", openaiRes.status, await openaiRes.text());
    return c.json({ error: `OpenAI returned ${openaiRes.status}.` }, 502);
  }
  const result = await openaiRes.json();
  const content = result?.choices?.[0]?.message?.content;
  if (!content) return c.json({ error: "OpenAI returned no content." }, 502);
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { return c.json({ error: "OpenAI returned malformed JSON." }, 502); }

  parsed.generatedAt = new Date().toISOString();
  const updatedBlob = JSON.stringify({ ...recipe, aiAdjustChips: parsed });
  await c.env.DB.prepare("UPDATE recipes SET blob = ? WHERE id = ?")
    .bind(updatedBlob, recipeId)
    .run();

  logAiEvent(c, "adjust-chips", recipeId, {
    ...aiTokens(result),
    chipCount: parsed?.chips?.length || 0,
    force,
  });
  return c.json({ ...parsed, cached: false });
});

// ─── AI: Family says — synthesise comments into a summary + tweaks ───
// Reads the recipe's tips + curated seed comments + live D1
// comments, hands them to the model, gets back a short prose
// synthesis ("Family says...") plus 0-4 concrete tweaks the cook
// can apply. Cached on recipe.familySays so every visitor after
// the first sees the result without a fresh AI call. Regenerate
// with ?force.
//
// Tweaks use the same action shape as /ai/adjust — setServings /
// setWeight / setCalTarget for things the app can actually apply,
// or { kind: "none", value: null } for advice-only tweaks the
// cook should just keep in mind ("rest 20 min not 15", "use
// frozen blueberries"). The client renders both as one-tap chips.
const AI_FAMILY_SAYS_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    tweaks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label:   { type: "string" },
          summary: { type: "string" },
          action: {
            type: ["object", "null"],
            properties: {
              kind:  { type: "string", enum: ["setServings", "setWeight", "setCalTarget", "none"] },
              value: { type: ["number", "null"] },
            },
            required: ["kind", "value"],
            additionalProperties: false,
          },
        },
        required: ["label", "summary", "action"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "tweaks"],
  additionalProperties: false,
};

app.post("/api/admin/ai/family-says", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!c.env.OPENAI_API_KEY) return c.json({ error: "OpenAI API key not configured." }, 500);

  const body = await c.req.json().catch(() => ({}));
  const recipeId = (body?.recipeId || "").trim();
  const force = !!body?.force;
  if (!recipeId) return c.json({ error: "missing recipeId" }, 400);

  const row = await c.env.DB.prepare("SELECT blob FROM recipes WHERE id = ?").bind(recipeId).first();
  if (!row) return c.json({ error: "recipe not found" }, 404);
  const recipe = JSON.parse(row.blob);

  if (recipe.familySays && !force) {
    return c.json({ ...recipe.familySays, cached: true });
  }

  // Pull the live comments out of D1 directly so the summary
  // includes whatever the family has posted since the recipe was
  // last edited.
  const liveRows = await c.env.DB.prepare(
    "SELECT author, body, rating, created_at FROM comments WHERE recipe_id = ? ORDER BY created_at ASC"
  ).bind(recipeId).all();
  const liveComments = (liveRows.results || []).map(r => ({
    name: r.author,
    text: r.body,
    rating: r.rating,
  }));

  // Combine three sources the family has used to comment on this
  // recipe: the cook's tips, the seed/curated comments in the
  // blob, and the live D1 comments. The model treats them all as
  // 'what the family says'.
  const allComments = [
    ...(recipe.tips || []).map(t => ({ name: "tip", text: t })),
    ...(recipe.comments || []).map(c => ({ name: c.name, text: c.text })),
    ...liveComments,
  ].filter(c => c.text);

  if (allComments.length === 0) {
    return c.json({ error: "no notes or comments to summarise" }, 422);
  }

  const target = {
    title:    recipe.title,
    course:   recipe.course,
    scaleBy:  recipe.scaleBy || "servings",
    servings: recipe.servingsDefault,
    weight:   recipe.defaultWeight || null,
    weightUnit: recipe.weightUnit || "lb",
    nutrition: recipe.nutrition || null,
  };

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${c.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: AI_OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `You synthesise what a family has learned about a recipe across their tips and comments. Return two things:

1. summary — 2-4 sentences, plain prose, written like a warm family cook reading the room. Reference what specific people say if it's distinctive ("Mom pulls at 125°F, not 130"). Highlight consensus where it exists, and gentle disagreement where it doesn't. No bullet points.

2. tweaks — 0-4 concrete adjustments the family consistently makes. Each has:
     • label — 3-5 word button text ("Pull at 125°F", "Half the sugar", "Frozen blueberries")
     • summary — one sentence explaining what to do and why the family loves it
     • action — exactly one structured change, or { kind: "none", value: null } for advice-only tweaks (substitutions, technique, ingredient swaps).

   Valid actions:
     • setServings (only if recipe.scaleBy is "servings")
     • setWeight (only if recipe.scaleBy is "weight")
     • setCalTarget — integer target calories per serving
     • none — for advice-only

Only return tweaks that come from what the family ACTUALLY said. Don't invent. If the comments don't suggest anything actionable, return an empty tweaks array.`,
        },
        {
          role: "user",
          content: `RECIPE:\n${JSON.stringify(target, null, 2)}\n\nFAMILY NOTES + COMMENTS:\n${JSON.stringify(allComments, null, 2)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "family_says", strict: true, schema: AI_FAMILY_SAYS_SCHEMA },
      },
    }),
  });
  if (!openaiRes.ok) {
    console.error("OpenAI family-says error", openaiRes.status, await openaiRes.text());
    return c.json({ error: `OpenAI returned ${openaiRes.status}.` }, 502);
  }
  const result = await openaiRes.json();
  const content = result?.choices?.[0]?.message?.content;
  if (!content) return c.json({ error: "OpenAI returned no content." }, 502);
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { return c.json({ error: "OpenAI returned malformed JSON." }, 502); }

  parsed.generatedAt = new Date().toISOString();
  const updatedBlob = JSON.stringify({ ...recipe, familySays: parsed });
  await c.env.DB.prepare("UPDATE recipes SET blob = ? WHERE id = ?")
    .bind(updatedBlob, recipeId)
    .run();

  logAiEvent(c, "family-says", recipeId, {
    ...aiTokens(result),
    commentCount: allComments.length,
    tweakCount: parsed?.tweaks?.length || 0,
    force,
  });
  return c.json({ ...parsed, cached: false });
});

// ─── AI: Lab — shared draft + iteration schemas ───
// The Lab uses a slimmer recipe shape than the cookbook (no
// nutrition, no diet tags, no photo) because iterations are about
// the food — the cookbook fields get filled in at Promote time.
const AI_LAB_DRAFT_SCHEMA = {
  type: "object",
  properties: {
    title:    { type: "string" },
    blurb:    { type: "string" },
    time:     { type: "number" },
    servings: { type: "number" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          qty:  { type: "number" },
          unit: { type: "string" },
          item: { type: "string" },
        },
        required: ["qty", "unit", "item"],
        additionalProperties: false,
      },
    },
    steps: { type: "array", items: { type: "string" } },
    tips:  { type: "array", items: { type: "string" } },
  },
  required: ["title", "blurb", "time", "servings", "ingredients", "steps", "tips"],
  additionalProperties: false,
};

const AI_LAB_ITERATE_SCHEMA = {
  type: "object",
  properties: {
    draft:    AI_LAB_DRAFT_SCHEMA,
    // One short line listing what changed vs the previous draft.
    // Rendered as a "What changed" pill above the new draft so
    // cooks can scan iteration history at a glance.
    diff:     { type: "string" },
    // One-sentence framing the cook sees next to the new draft.
    greeting: { type: "string" },
  },
  required: ["draft", "diff", "greeting"],
  additionalProperties: false,
};

// ─── AI: Lab iterate — produce or revise a draft ───
app.post("/api/admin/ai/lab-iterate", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!c.env.OPENAI_API_KEY) return c.json({ error: "OpenAI API key not configured." }, 500);

  const body = await c.req.json().catch(() => ({}));
  const prompt = (body?.prompt || "").trim();
  if (!prompt) return c.json({ error: "missing prompt" }, 400);
  const previousDraft = body?.previousDraft || null;
  const history = Array.isArray(body?.history)
    ? body.history.slice(-8).map(t => ({
        role: t.role === "ai" ? "assistant" : "user",
        text: (t.text || "").slice(0, 300),
        tastingNote: t.tastingNote || null,
      }))
    : [];

  const messages = [
    {
      role: "system",
      content: `You are the kitchen experimentation AI for a family cookbook's "Lab". The cook is iterating on a dish — your job is to produce a recipe draft that incorporates what they just asked for. Voice: warm, opinionated family cook. Don't apologise, don't add caveats, don't list every assumption. Just write the recipe.

When a previous draft is provided, treat your output as the NEXT iteration — change what the cook asked to change, leave the rest stable. Don't quietly rewrite steps that weren't touched.

The diff field is ONE short clause listing the changes made vs the previous draft, comma-separated ("halved sugar, added cardamom, swapped milk for buttermilk"). If there's no previous draft, diff is "Initial draft".

The greeting field is one short sentence framing the new draft for the cook ("Here's the lighter version — want me to push it further?", "First pass at the brioche. Tell me what to change.").`,
    },
    ...(previousDraft ? [{
      role: "user",
      content: `PREVIOUS DRAFT:\n${JSON.stringify(previousDraft, null, 2)}`,
    }] : []),
    ...history.map(t => ({
      role: t.role,
      content: t.tastingNote
        ? `${t.text}\n\n[tasting note: ${t.tastingNote}]`
        : t.text,
    })),
    { role: "user", content: prompt },
  ];

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${c.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: AI_OPENAI_MODEL,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: { name: "lab_iterate", strict: true, schema: AI_LAB_ITERATE_SCHEMA },
      },
    }),
  });
  if (!openaiRes.ok) {
    console.error("OpenAI lab-iterate error", openaiRes.status, await openaiRes.text());
    return c.json({ error: `OpenAI returned ${openaiRes.status}.` }, 502);
  }
  const result = await openaiRes.json();
  const content = result?.choices?.[0]?.message?.content;
  if (!content) return c.json({ error: "OpenAI returned no content." }, 502);
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { return c.json({ error: "OpenAI returned malformed JSON." }, 502); }
  logAiEvent(c, "lab-iterate", null, {
    ...aiTokens(result),
    prompt: prompt.slice(0, 200),
    hasPrevious: !!previousDraft,
    historyTurns: history.length,
    diff: (parsed?.diff || "").slice(0, 120),
    title: parsed?.draft?.title || null,
  });
  return c.json(parsed);
});

// ─── AI: Lab suggest — "what to try next" ───
const AI_LAB_SUGGEST_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label:  { type: "string" },
          prompt: { type: "string" },
          why:    { type: "string" },
        },
        required: ["label", "prompt", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
};

app.post("/api/admin/ai/lab-suggest", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!c.env.OPENAI_API_KEY) return c.json({ error: "OpenAI API key not configured." }, 500);

  const body = await c.req.json().catch(() => ({}));
  const latestDraft = body?.latestDraft;
  if (!latestDraft) return c.json({ error: "missing latestDraft" }, 400);
  const tastingNotes = Array.isArray(body?.tastingNotes)
    ? body.tastingNotes.filter(n => n?.note).slice(-6)
    : [];

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${c.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: AI_OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `Given a draft recipe and a small history of tasting notes from earlier iterations, propose 2-3 concrete next things the cook could try. Each suggestion has:
  • label — 3-5 words, button-shaped ("Brown the butter", "Swap milk for buttermilk")
  • prompt — the full request the cook would type back ("Brown the butter before adding it — see how it changes the crumb")
  • why — one sentence pointing at what in the recipe or tasting notes makes this worth trying

Don't suggest things the cook already tried. Use the tasting notes as evidence — if a previous iteration was 'too sweet', a sugar reduction is fair game; if 'crumb was tight', go for hydration or leavening.`,
        },
        {
          role: "user",
          content: `LATEST DRAFT:\n${JSON.stringify(latestDraft, null, 2)}\n\nTASTING NOTES (most recent last):\n${JSON.stringify(tastingNotes, null, 2)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "lab_suggest", strict: true, schema: AI_LAB_SUGGEST_SCHEMA },
      },
    }),
  });
  if (!openaiRes.ok) {
    console.error("OpenAI lab-suggest error", openaiRes.status, await openaiRes.text());
    return c.json({ error: `OpenAI returned ${openaiRes.status}.` }, 502);
  }
  const result = await openaiRes.json();
  const content = result?.choices?.[0]?.message?.content;
  if (!content) return c.json({ error: "OpenAI returned no content." }, 502);
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { return c.json({ error: "OpenAI returned malformed JSON." }, 502); }
  logAiEvent(c, "lab-suggest", null, {
    ...aiTokens(result),
    draftTitle: latestDraft?.title || null,
    tastingNoteCount: tastingNotes.length,
    suggestionCount: parsed?.suggestions?.length || 0,
  });
  return c.json(parsed);
});

// ─── AI: Lab promote — polish the draft for the cookbook ───
app.post("/api/admin/ai/lab-promote", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!c.env.OPENAI_API_KEY) return c.json({ error: "OpenAI API key not configured." }, 500);

  const body = await c.req.json().catch(() => ({}));
  const latestDraft = body?.latestDraft;
  if (!latestDraft) return c.json({ error: "missing latestDraft" }, 400);
  const tastingNotes = Array.isArray(body?.tastingNotes)
    ? body.tastingNotes.filter(n => n?.note).slice(-8)
    : [];
  const iterationCount = Number(body?.iterationCount) || 1;

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${c.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: AI_OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `You are polishing a Lab draft for the family cookbook. The cook has iterated on this dish ${iterationCount > 1 ? `${iterationCount} times` : "once"} and has tasting notes you should respect. Produce a polished version of the draft suitable for the cookbook:
  • title — concise, characterful (no AI-speak, no 'with a twist')
  • blurb — one sentence that captures the soul of the dish
  • steps — tightened, action verbs upfront; remove redundancy; keep cook-facing voice
  • tips — distil hard-won knowledge from the tasting notes ("frozen blueberries don't bleed"; "let it rest the full 20 min, not 15"). Drop fluffy ones.
  • ingredients — final amounts. Round sensibly.
  • diff — list what you polished (one short clause)
  • greeting — one sentence telling the cook the polished draft is ready for them to review.

Don't invent new ingredients or steps the cook never tested. If the tasting notes flag something unresolved, leave it as a tip ("The cardamom version was bolder — try 1/4 tsp next time.").`,
        },
        {
          role: "user",
          content: `LATEST DRAFT:\n${JSON.stringify(latestDraft, null, 2)}\n\nTASTING NOTES (most recent last):\n${JSON.stringify(tastingNotes, null, 2)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "lab_iterate", strict: true, schema: AI_LAB_ITERATE_SCHEMA },
      },
    }),
  });
  if (!openaiRes.ok) {
    console.error("OpenAI lab-promote error", openaiRes.status, await openaiRes.text());
    return c.json({ error: `OpenAI returned ${openaiRes.status}.` }, 502);
  }
  const result = await openaiRes.json();
  const content = result?.choices?.[0]?.message?.content;
  if (!content) return c.json({ error: "OpenAI returned no content." }, 502);
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { return c.json({ error: "OpenAI returned malformed JSON." }, 502); }
  logAiEvent(c, "lab-promote", null, {
    ...aiTokens(result),
    inputTitle: latestDraft?.title || null,
    outputTitle: parsed?.draft?.title || null,
    iterationCount,
    tastingNoteCount: tastingNotes.length,
  });
  return c.json(parsed);
});

// ─── AI: Nutrition estimate ───
// Some extracted recipes come back with zero nutrition (the model
// gave up on the rough cookbook print). The editor exposes an
// 'Estimate with AI' button that posts the ingredient list + title
// + servings here and gets back per-serving rough estimates that
// pre-fill the form fields.
const AI_NUTRITION_SCHEMA = {
  type: "object",
  properties: {
    cal:     { type: "number" },
    protein: { type: "number" },
    carbs:   { type: "number" },
    fat:     { type: "number" },
    fiber:   { type: "number" },
    sodium:  { type: "number" },
  },
  required: ["cal", "protein", "carbs", "fat", "fiber", "sodium"],
  additionalProperties: false,
};

// ─── AI: Polish recipe — per-field enrichment proposals ───
// The cook explicitly asks for an enrichment pass on a recipe
// they've already saved or are editing. The model produces a list
// of small, specific proposals — each touching ONE field — that
// the cook reviews and accepts/discards individually in a diff
// modal. The model never overwrites anything; the cook decides.
//
// Constraints (in the system prompt):
//   • Never touch i.qtyNote or any verbatim intuitive measure
//     ("by eye", "to taste", "until X happens"). Sacred.
//   • Don't invent new ingredients or steps.
//   • Don't add precision where the cook used vagueness on purpose.
//   • Each proposal is one field change with a one-clause reason.
//
// Paths are dot-notation pointers into the recipe shape:
//   "title", "subtitle"
//   "tips.0", "tips.3"
//   "steps.2.t", "steps.2.d"
//   "ingredients.5.item", "ingredients.5.unit"
const AI_POLISH_SCHEMA = {
  type: "object",
  properties: {
    proposals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          // Dot-notation pointer (e.g. "steps.2.d", "tips.0").
          path:     { type: "string" },
          // Human-readable label for the diff modal ("Step 3 instructions").
          label:    { type: "string" },
          current:  { type: "string" },
          proposed: { type: "string" },
          // One short clause — why this change improves the recipe.
          reason:   { type: "string" },
        },
        required: ["path", "label", "current", "proposed", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["proposals"],
  additionalProperties: false,
};

app.post("/api/admin/ai/polish-recipe", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!c.env.OPENAI_API_KEY) return c.json({ error: "OpenAI API key not configured." }, 500);

  const body = await c.req.json().catch(() => ({}));
  const recipe = body?.recipe;
  if (!recipe?.title) return c.json({ error: "missing recipe" }, 400);

  // Compact context — we send title/subtitle/ingredients/steps/
  // tips so the model can scan everything. Comments and pairings
  // are noise here.
  const context = {
    title:    recipe.title,
    subtitle: recipe.subtitle,
    course:   recipe.course,
    cuisine:  recipe.cuisine,
    ingredients: recipe.ingredients || [],
    steps:    (recipe.steps || []).map((s, i) => ({ i, t: s.t, d: s.d })),
    tips:     recipe.tips || [],
  };

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${c.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: AI_OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `You polish a family-cookbook recipe. The cook has explicitly asked for an enrichment pass on this recipe — you produce a list of small, specific proposals (each touches ONE field) that the cook reviews and accepts or discards one at a time. You never apply changes yourself.

ALLOWED kinds of proposals:
  • Typo / grammar / capitalization fixes on title, subtitle, step titles, step descriptions, tips.
  • Filling in missing structural data: a step that just says "mix" could become "mix until smooth and uniform"; a tip that's a fragment could be a full sentence.
  • Tightening rambling steps; replacing vague WORDS where the cook clearly didn't intend vagueness ("do the thing" → "fold the dough") but NOT replacing intentional vagueness (see below).
  • Normalising units that are clearly inconsistent ("tablespoons" → "tbsp" if the rest of the recipe uses abbreviations).

NEVER do these:
  • Don't touch any ingredient where qtyNote is non-empty. The cook's intuitive measure ("by eye", "to taste", "a glug") is sacred. Skip those ingredients entirely.
  • Don't replace intuitive cooking cues in steps. "until the bone shows", "when you can smell the garlic", "stir until your arm gets tired" — leave them word-for-word.
  • Don't invent new ingredients or new steps that weren't in the source.
  • Don't add precise times/temperatures to steps that don't have them — that's a craft judgement the cook owns.
  • Don't change tags, diet, course, occasion, cuisine, nutrition. The cook handles those manually.
  • Don't propose changes when current and proposed would be identical.

Each proposal:
  • path — dot-notation pointer ("title", "subtitle", "steps.2.t", "steps.2.d", "ingredients.5.item", "ingredients.5.unit", "tips.0", "tips.3")
  • label — human-readable ("Title", "Step 3 title", "Step 3 instructions", "Ingredient 6 name", "Tip 1")
  • current — current value (verbatim)
  • proposed — proposed value (your improvement)
  • reason — one short clause ("Typo fix", "Filled in missing cue", "Tightened wording")

If the recipe is already in good shape, return an empty proposals array. Better to be conservative — small focused list is better than a long list of nitpicks.`,
        },
        { role: "user", content: JSON.stringify(context, null, 2) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "polish_recipe", strict: true, schema: AI_POLISH_SCHEMA },
      },
    }),
  });
  if (!openaiRes.ok) {
    console.error("OpenAI polish-recipe error", openaiRes.status, await openaiRes.text());
    return c.json({ error: `OpenAI returned ${openaiRes.status}.` }, 502);
  }
  const result = await openaiRes.json();
  const content = result?.choices?.[0]?.message?.content;
  if (!content) return c.json({ error: "OpenAI returned no content." }, 502);
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { return c.json({ error: "OpenAI returned malformed JSON." }, 502); }

  logAiEvent(c, "polish-recipe", recipe?.id || null, {
    ...aiTokens(result),
    title: recipe.title,
    proposalCount: parsed?.proposals?.length || 0,
  });
  return c.json(parsed);
});

app.post("/api/admin/ai/nutrition", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!c.env.OPENAI_API_KEY) return c.json({ error: "OpenAI API key not configured." }, 500);

  const body = await c.req.json().catch(() => ({}));
  const title = (body?.title || "").trim() || "this dish";
  const servings = Number(body?.servingsDefault) || 4;
  const ingredients = Array.isArray(body?.ingredients) ? body.ingredients : [];
  if (!ingredients.length) return c.json({ error: "no ingredients provided" }, 400);

  const lines = ingredients.map(i => `${i.qty ?? ""} ${i.unit ?? ""} ${i.item}`.trim());

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${c.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: AI_OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: "You are a nutrition estimator. Given an ingredient list and a serving count, return rough per-serving nutrition: calories (cal), protein/carbs/fat/fiber in grams, sodium in milligrams. Round to whole numbers. Be conservative and realistic — these are family-cookbook estimates, not lab measurements.",
        },
        {
          role: "user",
          content: `DISH: ${title}\nMAKES ${servings} servings\n\nINGREDIENTS:\n${lines.join("\n")}\n\nEstimate per-serving nutrition.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "nutrition", strict: true, schema: AI_NUTRITION_SCHEMA },
      },
    }),
  });
  if (!openaiRes.ok) {
    console.error("OpenAI nutrition error", openaiRes.status, await openaiRes.text());
    return c.json({ error: `OpenAI returned ${openaiRes.status}.` }, 502);
  }
  const result = await openaiRes.json();
  const content = result?.choices?.[0]?.message?.content;
  if (!content) return c.json({ error: "OpenAI returned no content." }, 502);
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { return c.json({ error: "OpenAI returned malformed JSON." }, 502); }
  logAiEvent(c, "nutrition", body?.recipeId || null, {
    ...aiTokens(result),
    title,
    servings,
    ingredientCount: ingredients.length,
    cal: parsed?.cal ?? null,
  });
  return c.json(parsed);
});

// ─── AI: Hero image ───
// Generates a single photoreal hero image from the recipe's title
// in the family-cookbook style (warm natural light, rustic wooden
// table, neutral ceramics, no text/watermarks). Uses OpenAI's
// gpt-image-1 — ~4¢ per image — so we charge the cap 5¢ to keep
// usage in check (≈ 20 generations per $1/day cap).
//
// Routes to one of four prompt templates based on course + title
// heuristics:
//   • Dessert → dessert template
//   • Soup/sauce/gravy/broth/jus/stock keywords → soup template
//   • Butter/jam/aioli/relish/condiment keywords → condiment
//   • everything else → default editorial template
//
// `ingredients` and `steps` (when supplied) are stitched into the
// prompt as visual context — they tell the model what should
// physically be in the dish and how it's plated / shaped /
// cooked. The title alone often misses crucial visual cues
// ("rolls" vs "loaf", "skillet" vs "casserole", "glazed" vs
// "frosted"); those live in the steps, not the title.
function buildHeroImageContext(ingredients, steps) {
  // Top 8 ingredient names — earliest entries are typically the
  // headline ones (proteins, flour, fruit) before the supporting
  // cast (salt, oil, baking powder). qty/unit don't matter for
  // visual prompting.
  const items = Array.isArray(ingredients)
    ? ingredients.slice(0, 8).map(i => (i?.item || "").trim()).filter(Boolean)
    : [];
  // First 3 step descriptions, trimmed to 120 chars each. Early
  // steps usually pin down form factor (rolled, layered, poured),
  // cookware (skillet, sheet pan), and finish (glazed, frosted).
  const stepLines = Array.isArray(steps)
    ? steps.slice(0, 3).map(s => {
        const text = typeof s === "string" ? s : (s?.d || s?.t || "");
        return text.trim().slice(0, 120);
      }).filter(Boolean)
    : [];
  const parts = [];
  if (items.length) parts.push(`Key ingredients visible in the dish: ${items.join(", ")}.`);
  if (stepLines.length) parts.push(`Preparation cues for visual style: ${stepLines.join(" → ")}.`);
  return parts.join(" ");
}

function buildHeroImagePrompt(title, course, ingredients, steps) {
  const NEG = "No text, no labels, no watermarks, no AI artifacts, no oversaturated colors, no excessive garnish, no modern restaurant fine-dining plating, no unrealistic ingredients, no plastic containers, no stock photo look, no cartoon appearance.";
  const ctx = buildHeroImageContext(ingredients, steps);
  // Append context as its own sentence near the end so the model
  // treats it as supporting detail rather than overriding the
  // editorial-style anchor.
  const CTX = ctx ? ` ${ctx}` : "";
  const t = (title || "").toLowerCase();
  const SOUP = /soup|sauce|gravy|broth|jus|stock|chili|stew|bisque|chowder/;
  const COND = /butter|jam|preserve|chutney|relish|aioli|salsa|crema|hummus|pesto|spread|compote|curd|marmalade/;
  if (course === "Dessert") {
    return `Professional editorial food photography of ${title}, rustic homemade dessert presented in a ceramic baking dish with a serving portion visible nearby. Warm natural window light, cozy family gathering aesthetic, farmhouse table, neutral ceramics, slightly zoomed out composition, realistic textures, homemade appearance, high-end cookbook photography, photorealistic, highly detailed, no text.${CTX} ${NEG}`;
  }
  if (COND.test(t)) {
    return `Professional editorial food photography of ${title}, served in a small ceramic ramekin on a rustic wooden table. The bowl should appear relatively small within the frame, with plenty of surrounding negative space and a few relevant ingredients nearby. Warm natural light, cozy farmhouse aesthetic, neutral ceramics, homemade appearance, photorealistic cookbook photography, highly detailed, no text.${CTX} ${NEG}`;
  }
  if (SOUP.test(t)) {
    return `Professional editorial food photography of ${title}, served in a small ceramic bowl on a rustic wooden table. Slightly zoomed out composition with ingredients subtly visible in the scene. Warm natural light, cozy farmhouse aesthetic, homemade appearance, neutral ceramics, shallow depth of field, cookbook photography, photorealistic, highly detailed, no text.${CTX} ${NEG}`;
  }
  return `Professional editorial food photography of ${title}, styled for a premium family cookbook. Rustic wooden table, warm natural window light, soft shadows, neutral ceramic dishware, cozy farmhouse aesthetic, realistic textures, authentic homemade appearance, inviting and comforting. Slightly zoomed out composition showing the plated dish plus a few relevant ingredients and serving elements around it. Shallow depth of field, high-end food magazine quality, warm earth tones, natural colors, no artificial garnish, no restaurant plating tweezers, no text, no watermarks. Focus on the food looking homemade, traditional, and delicious. Photorealistic, highly detailed, 4k food photography.${CTX} ${NEG}`;
}

app.post("/api/admin/ai/hero-image", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!c.env.OPENAI_API_KEY) return c.json({ error: "OpenAI API key not configured." }, 500);

  const body = await c.req.json().catch(() => ({}));
  const title = (body?.title || "").trim();
  const course = (body?.course || "").trim();
  if (!title) return c.json({ error: "missing title" }, 400);

  const prompt = buildHeroImagePrompt(title, course, body?.ingredients, body?.steps);

  const openaiRes = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${c.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024",
    }),
  });
  if (!openaiRes.ok) {
    console.error("OpenAI image error", openaiRes.status, await openaiRes.text());
    return c.json({ error: `OpenAI returned ${openaiRes.status}.` }, 502);
  }
  const result = await openaiRes.json();
  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) return c.json({ error: "OpenAI returned no image." }, 502);

  // Decode base64 to raw bytes and store in R2 next to user uploads.
  // We share the /api/images/:key serving path so the photo URL
  // looks identical to a uploaded photo from the user's POV.
  const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
  const key = `ai-${crypto.randomUUID()}.png`;
  await c.env.IMAGES.put(key, bytes, {
    httpMetadata: { contentType: "image/png" },
  });

  logAiEvent(c, "hero-image", body?.recipeId || null, {
    ...aiTokens(result),
    title,
    course,
    hasIngredients: Array.isArray(body?.ingredients) && body.ingredients.length > 0,
    hasSteps: Array.isArray(body?.steps) && body.steps.length > 0,
    key,
  });
  return c.json({ url: `/api/images/${key}`, key, prompt });
});

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
