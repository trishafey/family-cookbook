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

  // Daily cap reuses the same table as extraction.
  const today = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare("SELECT cost_cents FROM ai_usage WHERE date = ?").bind(today).first();
  if ((row?.cost_cents || 0) >= AI_DAILY_CAP_CENTS) {
    console.warn("translate skipped: daily cap reached");
    return;
  }
  await env.DB.prepare(
    "INSERT INTO ai_usage (date, cost_cents) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET cost_cents = cost_cents + excluded.cost_cents"
  ).bind(today, AI_COST_PER_CALL_CENTS).run();

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

  // Re-translate after every edit so Polish stays in sync with the
  // canonical English. Fire-and-forget; the cook's PATCH returns
  // immediately.
  c.executionCtx.waitUntil(translateAndStore(c.env, id, merged, "en", "pl"));

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
// can't hallucinate extra keys or skip required ones. Gated behind
// a Workers KV-free daily-spend cap (stored in D1 ai_usage table) so
// a runaway loop can't drain the OpenAI account.

const AI_DAILY_CAP_CENTS = 100;         // $1/day. Bump in code when the family wants more.
const AI_COST_PER_CALL_CENTS = 1;       // Coarse: real cost is ~0.06¢; we round up so the cap doubles as a call-rate limit.
const AI_OPENAI_MODEL = "gpt-4o-mini";

const AI_EXTRACT_SYSTEM_PROMPT = `You are a recipe extraction assistant for a family cookbook. The user will paste text containing a recipe — could be an email from a relative, a blog post copy-paste, a screenshot transcript, or freeform notes. Extract the recipe into structured JSON matching the provided schema.

QUANTITIES (critical)
- qty MUST always be a positive number > 0. NEVER return 0.
- "a" / "an" / "one" → qty=1
- "a couple" → qty=2
- "a few" / "several" → qty=3
- "a pinch" / "a dash" → qty=0.25, unit="tsp"
- "a sprinkle" → qty=1, unit="tsp"
- "to taste" → qty=0.5, unit="tsp"
- If the recipe says "1 kg" or "2 lb", USE THAT NUMBER as qty and that unit. Do not drop quantities.
- When the recipe is truly silent on a quantity, use your best estimate (default qty=1, unit="" for countable items; qty=1, unit="tbsp" for spreads/sauces).

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
- Keep all the original substance: every quantity, every cue ("until golden", "until water evaporates"), every conditional ("if you prefer"), every optional addition, every warning ("not too much or it will be bitter").
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
        required: ["qty", "unit", "item", "grp"],
        properties: {
          qty: { type: "number" },
          unit: { type: "string" },
          item: { type: "string" },
          grp: { type: "string" },
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

async function aiCapCheckAndIncrement(c) {
  const today = new Date().toISOString().slice(0, 10);
  const row = await c.env.DB.prepare("SELECT cost_cents FROM ai_usage WHERE date = ?").bind(today).first();
  if ((row?.cost_cents || 0) >= AI_DAILY_CAP_CENTS) {
    return { ok: false, error: "Daily AI spend cap reached. Try again tomorrow." };
  }
  await c.env.DB.prepare(
    "INSERT INTO ai_usage (date, cost_cents) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET cost_cents = cost_cents + excluded.cost_cents"
  ).bind(today, AI_COST_PER_CALL_CENTS).run();
  return { ok: true };
}

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

  const cap = await aiCapCheckAndIncrement(c);
  if (!cap.ok) return c.json({ error: cap.error }, 429);

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

  const cap = await aiCapCheckAndIncrement(c);
  if (!cap.ok) return c.json({ error: cap.error }, 429);

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

  const cap = await aiCapCheckAndIncrement(c);
  if (!cap.ok) return c.json({ error: cap.error }, 429);

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

  // First snapshot becomes the hero photo. The full list rides
  // along on sourcePhotos so the recipe blob keeps every original
  // — useful for a future "view the original" reveal on a
  // handwritten card from grandma.
  if (sourcePhotos.length) {
    parsed.photo = sourcePhotos[0];
    parsed.sourcePhotos = sourcePhotos;
  }

  return c.json(parsed);
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
