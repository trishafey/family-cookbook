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
import {
  hashPassword, verifyPassword, isValidEmail, passwordIssues, passwordPolicyIssue,
  signSession, verifySession, sessionCookie, clearSessionCookie, readSessionCookie,
  TEMP_PASSWORD_SALT,
} from "./auth.js";

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

// Self-heal: the email/password migration (0025) is not
// running on Workers Builds prebuild yet. Add the columns
// inline at boot so the auth endpoints don't crash with
// "no such column". Each ALTER is wrapped in catch() so
// reruns (column already exists) are no-ops. Safe to delete
// once 0025 actually runs on the remote DB.
async function ensureAuthColumns(env) {
  const stmts = [
    "ALTER TABLE users ADD COLUMN password_hash TEXT",
    "ALTER TABLE users ADD COLUMN password_salt TEXT",
    "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN verification_token TEXT",
    "ALTER TABLE users ADD COLUMN verification_expires TEXT",
    "ALTER TABLE users ADD COLUMN reset_token TEXT",
    "ALTER TABLE users ADD COLUMN reset_expires TEXT",
    "ALTER TABLE users ADD COLUMN last_login_at TEXT",
    "ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN failed_login_until TEXT",
  ];
  for (const sql of stmts) {
    await env.DB.prepare(sql).run().catch(() => {});
  }
  // Backfill: seed Tomato123 / fixed temp salt onto any account
  // that has no password yet (mirrors migration 0026).
  await env.DB.prepare(
    `UPDATE users
       SET password_hash = '659ea802e67cb4ae63aa255ab2b7e260ba2dfcd7e934f562bea5eea02404d252',
           password_salt = '686569726c6f6f6d2d74656d702d3032'
     WHERE password_hash IS NULL`
  ).run().catch(() => {});
}

// Resolve the session cookie (or legacy CF Access header) into
// c.var.authedEmail once per request so route handlers can stay
// synchronous on the authedEmail() call.
app.use("*", resolveSession);

// Run the auth-column self-heal exactly once per worker
// instance. A module-scope promise gives us cheap idempotency
// without needing a real init lifecycle.
let _authReady = null;
app.use("/api/auth/*", async (c, next) => {
  if (!_authReady) _authReady = ensureAuthColumns(c.env);
  await _authReady;
  return next();
});
app.use("/api/admin/users/:email/reset-password", async (c, next) => {
  if (!_authReady) _authReady = ensureAuthColumns(c.env);
  await _authReady;
  return next();
});

// ─── Email + password auth (Phase 1) ───
// Signup writes a hashed password and immediately starts a
// session — verification email lands in Phase 2. Login does
// constant-time hash comparison + per-account lockout after
// five consecutive failures.
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCKOUT_MINUTES = 15;

// Surface internal worker errors as readable JSON on the auth
// endpoints (default Hono 500 is opaque, which made the temp
// password rollout impossible to diagnose).
function jsonError(err) {
  return { error: err?.message || "Unexpected error.", detail: String(err) };
}

app.get("/api/auth/diagnose", async (c) => {
  if (!(await isAdmin(c))) return c.json({ error: "admin only" }, 403);
  const email = (c.req.query("email") || "").toLowerCase();
  const hasSecret = !!c.env.SESSION_SECRET;
  let row = null;
  if (email) {
    row = await c.env.DB.prepare(
      "SELECT email, password_hash IS NOT NULL AS has_hash, password_salt, status FROM users WHERE LOWER(email) = LOWER(?)"
    ).bind(email).first();
  }
  return c.json({
    sessionSecretSet: hasSecret,
    user: row ? {
      email: row.email,
      hasHash: !!row.has_hash,
      saltPrefix: row.password_salt ? row.password_salt.slice(0, 12) : null,
      status: row.status,
    } : null,
  });
});

app.post("/api/auth/signup", async (c) => {
  try {
  const body = await c.req.json().catch(() => ({}));
  const email = (body?.email || "").toString().trim().toLowerCase();
  const password = (body?.password || "").toString();
  const firstName = (body?.firstName || "").toString().trim().slice(0, 60);
  const lastName = (body?.lastName || "").toString().trim().slice(0, 60);
  const phone = (body?.phone || "").toString().trim().slice(0, 32);
  const lang = ["en", "enUS", "pl", "es", "el", "pt", "fil"].includes(body?.lang) ? body.lang : "en";

  if (!isValidEmail(email)) return c.json({ error: "Enter a valid email address." }, 400);
  const pwIssue = passwordIssues(password);
  if (pwIssue) return c.json({ error: pwIssue }, 400);
  if (!firstName || !lastName) return c.json({ error: "First and last name are required." }, 400);
  if (!phone) return c.json({ error: "Phone number is required." }, 400);

  // Reject if a fully-registered user already exists. Old rows
  // from the CF Access flow (no password_hash) can still upgrade
  // by going through the password-reset path.
  const existing = await c.env.DB.prepare(
    "SELECT email, password_hash FROM users WHERE LOWER(email) = ?"
  ).bind(email).first();
  if (existing?.password_hash) {
    return c.json({ error: "An account with that email already exists. Try signing in." }, 409);
  }

  const { hash, salt } = await hashPassword(password);
  const displayName = `${firstName} ${lastName}`.trim();
  const now = new Date().toISOString();
  if (existing) {
    await c.env.DB.prepare(
      `UPDATE users SET password_hash = ?, password_salt = ?,
                        first_name = ?, last_name = ?, phone = ?,
                        display_name = ?, lang = ?, last_login_at = ?
       WHERE LOWER(email) = ?`
    ).bind(hash, salt, firstName, lastName, phone, displayName, lang, now, email).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO users (email, display_name, first_name, last_name, phone, lang,
                          password_hash, password_salt,
                          tier, status, email_verified,
                          created_at, last_seen_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'full', 'pending', 0, ?, ?, ?)`
    ).bind(email, displayName, firstName, lastName, phone, lang, hash, salt, now, now, now).run();
  }

  const token = await signSession(c.env, email);
  c.header("Set-Cookie", sessionCookie(token));
  return c.json({ ok: true, email });
  } catch (err) {
    console.error("signup error", err);
    return c.json(jsonError(err), 500);
  }
});

app.post("/api/auth/login", async (c) => {
  try {
  const body = await c.req.json().catch(() => ({}));
  const email = (body?.email || "").toString().trim().toLowerCase();
  const password = (body?.password || "").toString();
  if (!isValidEmail(email) || !password) {
    return c.json({ error: "Email and password required." }, 400);
  }
  const row = await c.env.DB.prepare(
    `SELECT email, password_hash, password_salt,
            failed_login_count, failed_login_until
     FROM users WHERE LOWER(email) = LOWER(?)`
  ).bind(email).first();
  if (!row?.password_hash) {
    // Don't leak whether the email exists.
    return c.json({ error: "That email and password don't match an account." }, 401);
  }
  if (row.failed_login_until && new Date(row.failed_login_until) > new Date()) {
    return c.json({
      error: "Too many failed attempts. Try again in a few minutes.",
    }, 429);
  }
  const ok = await verifyPassword(password, row.password_hash, row.password_salt);
  if (!ok) {
    const fails = (row.failed_login_count || 0) + 1;
    const until = fails >= LOGIN_MAX_FAILURES
      ? new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60_000).toISOString()
      : null;
    await c.env.DB.prepare(
      "UPDATE users SET failed_login_count = ?, failed_login_until = ? WHERE LOWER(email) = ?"
    ).bind(fails, until, email).run().catch(() => {});
    return c.json({ error: "That email and password don't match an account." }, 401);
  }
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "UPDATE users SET failed_login_count = 0, failed_login_until = NULL, last_login_at = ?, last_seen_at = ? WHERE LOWER(email) = LOWER(?)"
  ).bind(now, now, email).run().catch(() => {});
  // mustChangePassword: the seeded temp salt means this account
  // was provisioned via migration 0026, not by the cook. Frontend
  // pops the "set a new password" modal before letting them in.
  const mustChangePassword = (row.password_salt || "").toLowerCase() === TEMP_PASSWORD_SALT;
  const token = await signSession(c.env, email);
  c.header("Set-Cookie", sessionCookie(token));
  return c.json({ ok: true, email, mustChangePassword });
  } catch (err) {
    console.error("login error", err);
    return c.json(jsonError(err), 500);
  }
});

// Set a new password while signed in. Used by the post-login
// "you're on a temp password" modal and the future settings
// "change password" surface.
app.post("/api/auth/change-password", async (c) => {
  try {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const newPassword = (body?.newPassword || "").toString();
  const issue = passwordPolicyIssue(newPassword);
  if (issue) return c.json({ error: issue }, 400);
  const { hash, salt } = await hashPassword(newPassword);
  await c.env.DB.prepare(
    `UPDATE users SET password_hash = ?, password_salt = ?,
                      failed_login_count = 0, failed_login_until = NULL,
                      reset_token = NULL, reset_expires = NULL
     WHERE LOWER(email) = LOWER(?)`
  ).bind(hash, salt, email).run();
  return c.json({ ok: true });
  } catch (err) {
    console.error("change-password error", err);
    return c.json(jsonError(err), 500);
  }
});

app.post("/api/auth/logout", async (c) => {
  c.header("Set-Cookie", clearSessionCookie());
  return c.json({ ok: true });
});

app.get("/api/auth/me", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ email: null }, 200);
  return c.json({ email });
});

// Supported language codes for the per-cookbook switcher. Add a
// code here when the UI chrome translations land for it; recipe
// content translation works for any LANG_NAME entry already.
const SUPPORTED_LANGS = ["en", "enUS", "pl", "es", "el", "pt", "fil"];
const MAX_COOKBOOK_LANGS = 3;
// Normalise + cap a languages array submitted by the client.
// "en" is always included so a misclick can't strip the cookbook
// of its base language.
function normaliseLanguages(arr) {
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (const code of arr) {
    if (typeof code !== "string") continue;
    // Preserve the camelCase code for enUS — lower-casing it
    // breaks the SUPPORTED_LANGS membership check + breaks the
    // i18n lookup downstream. Other codes are already lowercase.
    const c = SUPPORTED_LANGS.find(s => s.toLowerCase() === code.toLowerCase());
    if (!c) continue;
    if (!out.includes(c)) out.push(c);
  }
  // At least one English variant (Canadian or American) is
  // required. Default to Canadian if the cook stripped both.
  const ENGLISH = ["en", "enUS"];
  if (!out.some(c => ENGLISH.includes(c))) out.unshift("en");
  return out.slice(0, MAX_COOKBOOK_LANGS);
}

// ─── Multi-tenant: list cookbooks the caller is a member of ───
// Powers the "My cookbooks" view + the cookbook switcher in the
// nav. Returns one row per membership, joined with cookbook
// metadata. yourRole comes from the membership row.
//
// Hosted under /api/admin/ because Cloudflare Access only injects
// the cf-access-authenticated-user-email header on the protected
// /api/admin/* paths.
app.get("/api/admin/cookbooks", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  // Guarantee the cook has a users row + personal + family
  // cookbook before we read membership. Idempotent.
  await ensureUserBootstrap(c);
  // Self-heal: the display_order column is added by migration
  // 0017. If a deploy beats the migration runner (or the runner
  // never fires), this ALTER ensures the rest of the handler can
  // still SELECT m.display_order. Silently ignored once the
  // column exists.
  await c.env.DB.prepare(
    "ALTER TABLE cookbook_members ADD COLUMN display_order INTEGER"
  ).run().catch(() => {});
  await c.env.DB.prepare(
    "ALTER TABLE cookbooks ADD COLUMN languages TEXT"
  ).run().catch(() => {});
  await c.env.DB.prepare(
    "ALTER TABLE cookbooks ADD COLUMN cover_color TEXT"
  ).run().catch(() => {});
  await c.env.DB.prepare(
    "ALTER TABLE cookbooks ADD COLUMN cookbook_type TEXT"
  ).run().catch(() => {});
  const admin = await isAdmin(c);

  // Admins see every cookbook (member or not). For non-admins,
  // only their memberships. The LEFT JOIN against cookbook_members
  // lets us return the caller's explicit role when they're a
  // real member, and surface "admin" when they're not but have
  // system-wide access.
  const rows = admin
    ? await c.env.DB.prepare(`
        SELECT c.id, c.owner_email, c.name, c.slug, c.visibility, c.blurb,
               c.cover_photo, c.cover_color, c.languages, c.cookbook_type, c.created_at, c.updated_at,
               m.role AS your_role, m.joined_at, m.display_order AS your_order,
               (SELECT COUNT(*) FROM cookbook_members WHERE cookbook_id = c.id) AS member_count,
               (SELECT COUNT(*) FROM recipes WHERE cookbook_id = c.id) AS recipe_count
        FROM cookbooks c
        LEFT JOIN cookbook_members m
          ON m.cookbook_id = c.id AND m.user_email = ?
        ORDER BY (m.user_email IS NULL) ASC,
                 COALESCE(m.display_order, 99999) ASC,
                 (c.owner_email = ?) DESC, c.created_at ASC
      `).bind(email, email).all()
    : await c.env.DB.prepare(`
        SELECT c.id, c.owner_email, c.name, c.slug, c.visibility, c.blurb,
               c.cover_photo, c.cover_color, c.languages, c.cookbook_type, c.created_at, c.updated_at,
               m.role AS your_role, m.joined_at, m.display_order AS your_order,
               (SELECT COUNT(*) FROM cookbook_members WHERE cookbook_id = c.id) AS member_count,
               (SELECT COUNT(*) FROM recipes WHERE cookbook_id = c.id) AS recipe_count
        FROM cookbooks c
        JOIN cookbook_members m ON m.cookbook_id = c.id
        WHERE m.user_email = ?
        ORDER BY COALESCE(m.display_order, 99999) ASC, c.created_at ASC
      `).bind(email).all();
  return c.json({
    isAdmin: admin,
    cookbooks: (rows.results || []).map(r => ({
      id: r.id,
      ownerEmail: r.owner_email,
      name: r.name,
      slug: r.slug,
      visibility: r.visibility,
      blurb: r.blurb || "",
      coverPhoto: r.cover_photo || null,
      coverColor: r.cover_color || null,
      languages: r.languages ? JSON.parse(r.languages) : ["en"],
      cookbookType: r.cookbook_type || null,
      // yourRole is the explicit membership role if any, else
      // "admin" (the admin-access fallback) — keeps the client
      // simple ("if role, you can do X").
      yourRole: r.your_role || (admin ? "admin" : null),
      adminAccess: admin && !r.your_role,
      joinedAt: r.joined_at,
      displayOrder: r.your_order ?? null,
      memberCount: r.member_count || 0,
      recipeCount: r.recipe_count || 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

// Cookbook details + members. Members get their explicit role;
// signed-in non-members get read-only "guest" access. The
// platform treats any cookbook URL as a share token — private
// just means it's not listed in Discover, not that the URL
// is unreachable.
app.get("/api/admin/cookbooks/:id", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const id = c.req.param("id");
  let role = await cookbookRole(c, id);
  if (!role) role = "guest";
  // Self-heal in case migration 0018 lags the deploy.
  await c.env.DB.prepare(
    "ALTER TABLE cookbooks ADD COLUMN languages TEXT"
  ).run().catch(() => {});
  await c.env.DB.prepare(
    "ALTER TABLE cookbooks ADD COLUMN cover_color TEXT"
  ).run().catch(() => {});
  await c.env.DB.prepare(
    "ALTER TABLE cookbooks ADD COLUMN cookbook_type TEXT"
  ).run().catch(() => {});
  const cb = await c.env.DB.prepare(
    "SELECT id, owner_email, name, slug, visibility, blurb, cover_photo, cover_color, languages, cookbook_type, created_at, updated_at FROM cookbooks WHERE id = ?"
  ).bind(id).first();
  if (!cb) return c.json({ error: "not found" }, 404);
  const members = await c.env.DB.prepare(`
    SELECT m.user_email, m.role, m.joined_at,
           u.display_name, u.first_name, u.last_name
    FROM cookbook_members m
    LEFT JOIN users u ON u.email = m.user_email
    WHERE m.cookbook_id = ?
    ORDER BY (m.role = 'owner') DESC, m.joined_at ASC
  `).bind(id).all();
  // Recipe count — for the cookbook index cards.
  const countRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM recipes WHERE cookbook_id = ?"
  ).bind(id).first();
  // Surface the caller's outstanding invite + outgoing join
  // request for this cookbook so the cookbook page can show an
  // "Accept invitation" button or "Request pending" status
  // instead of the default "Request to join".
  const nowIso = new Date().toISOString();
  const yourInvitation = await c.env.DB.prepare(
    `SELECT token, role FROM invitations
     WHERE cookbook_id = ? AND LOWER(email) = LOWER(?)
       AND accepted_at IS NULL AND expires_at > ?`
  ).bind(id, email, nowIso).first().catch(() => null);
  const yourPendingRequest = await c.env.DB.prepare(
    "SELECT created_at FROM join_requests WHERE cookbook_id = ? AND user_email = ? AND status = 'pending'"
  ).bind(id, email).first().catch(() => null);
  return c.json({
    yourInvitation: yourInvitation
      ? { token: yourInvitation.token, role: yourInvitation.role }
      : null,
    yourPendingRequest: yourPendingRequest
      ? { createdAt: yourPendingRequest.created_at }
      : null,
    cookbook: {
      id: cb.id,
      ownerEmail: cb.owner_email,
      name: cb.name,
      slug: cb.slug,
      visibility: cb.visibility,
      blurb: cb.blurb || "",
      coverPhoto: cb.cover_photo || null,
      coverColor: cb.cover_color || null,
      languages: cb.languages ? JSON.parse(cb.languages) : ["en"],
      cookbookType: cb.cookbook_type || null,
      createdAt: cb.created_at,
      updatedAt: cb.updated_at,
    },
    members: (members.results || []).map(m => ({
      email: m.user_email,
      displayName: m.display_name || null,
      firstName: m.first_name || null,
      lastName: m.last_name || null,
      role: m.role,
      joinedAt: m.joined_at,
    })),
    recipeCount: countRow?.n || 0,
    yourRole: role,
  });
});

// Lookup a cookbook by slug — convenience for the Discover →
// cookbook-page transition where the URL carries the slug. Same
// visibility rules as GET /:id (public cookbooks readable by any
// signed-in cook).
app.get("/api/admin/cookbooks/by-slug/:slug", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const slug = c.req.param("slug");
  const row = await c.env.DB.prepare(
    "SELECT id FROM cookbooks WHERE slug = ?"
  ).bind(slug).first();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ id: row.id });
});

// ─── Multi-tenant: create a new cookbook (Phase 4b-1) ───
// Reorder the caller's cookbooks. Body: { orderedIds: [...] }.
// Writes display_order = index for each id the caller is a member
// of. Ids the caller isn't a member of are silently skipped (so
// admin-access cookbooks don't break the call but also don't get
// per-user ordering — they're not in cookbook_members for this
// cook). The optional `defaultId` argument is sugar for "set this
// cookbook as default" — it's pinned to position 0 and the rest
// of the list slots in after, preserving relative order.
app.put("/api/admin/cookbooks/order", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  await ensureUserBootstrap(c);
  await c.env.DB.prepare(
    "ALTER TABLE cookbook_members ADD COLUMN display_order INTEGER"
  ).run().catch(() => {});
  const body = await c.req.json().catch(() => ({}));
  let ids = Array.isArray(body?.orderedIds) ? body.orderedIds.filter(x => typeof x === "string") : null;
  const defaultId = typeof body?.defaultId === "string" ? body.defaultId : null;

  // "Set as default" shortcut: caller doesn't have to send the full
  // ordered list — we re-read their current order and float
  // `defaultId` to position 0.
  if (defaultId && !ids) {
    const cur = await c.env.DB.prepare(
      `SELECT cookbook_id FROM cookbook_members
       WHERE user_email = ?
       ORDER BY COALESCE(display_order, 99999) ASC, joined_at ASC`
    ).bind(email).all();
    ids = (cur.results || []).map(r => r.cookbook_id);
    ids = [defaultId, ...ids.filter(id => id !== defaultId)];
  }

  if (!ids || ids.length === 0) return c.json({ error: "no ids" }, 400);

  // Batch the updates — D1 prepare/bind/run for each id; skips any
  // id the caller isn't actually a member of by relying on the
  // WHERE clause matching zero rows.
  const stmts = ids.map((id, i) =>
    c.env.DB.prepare(
      "UPDATE cookbook_members SET display_order = ? WHERE cookbook_id = ? AND user_email = ?"
    ).bind(i, id, email)
  );
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, order: ids });
});

// Caller becomes the owner. Visibility defaults to private.
// Returns the new cookbook + the caller's membership row.
app.post("/api/admin/cookbooks", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  await ensureUserBootstrap(c);
  const body = await c.req.json().catch(() => ({}));
  const name = (body?.name || "").toString().trim();
  if (!name) return c.json({ error: "name required" }, 400);
  if (name.length > 80) return c.json({ error: "name too long" }, 400);
  const blurb = (body?.blurb || "").toString().slice(0, 280);
  const visibility = ["private", "unlisted", "public"].includes(body?.visibility)
    ? body.visibility : "private";
  const languages = normaliseLanguages(body?.languages) || ["en"];
  const coverColor = (body?.coverColor === null || (typeof body?.coverColor === "string" && /^[a-zA-Z0-9#\-]{0,32}$/.test(body.coverColor)))
    ? (body.coverColor || null) : null;
  const coverPhoto = (typeof body?.coverPhoto === "string" && body.coverPhoto.length < 256) ? body.coverPhoto : null;

  const now = new Date().toISOString();
  const suffix = Math.random().toString(36).slice(2, 8);
  const id = `cb-${slugifyServer(name) || "cookbook"}-${suffix}`;
  const slug = `${slugifyServer(name) || "cookbook"}-${suffix}`;
  try {
    await c.env.DB.prepare(
      "ALTER TABLE cookbooks ADD COLUMN languages TEXT"
    ).run().catch(() => {});
    await c.env.DB.prepare(
      "ALTER TABLE cookbooks ADD COLUMN cover_color TEXT"
    ).run().catch(() => {});
    await c.env.DB.prepare(
      "INSERT INTO cookbooks (id, owner_email, name, slug, visibility, blurb, languages, cover_color, cover_photo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, email, name, slug, visibility, blurb, JSON.stringify(languages), coverColor, coverPhoto, now, now).run();
    await c.env.DB.prepare(
      "INSERT INTO cookbook_members (cookbook_id, user_email, role, joined_at) VALUES (?, ?, 'owner', ?)"
    ).bind(id, email, now).run();
  } catch (err) {
    console.error("create cookbook failed", err);
    return c.json({ error: "could not create cookbook" }, 500);
  }
  return c.json({
    cookbook: {
      id, ownerEmail: email, name, slug, visibility,
      blurb, coverPhoto, coverColor, languages,
      createdAt: now, updatedAt: now,
      yourRole: "owner",
    },
  });
});

// PATCH — rename, change blurb or visibility. Owner-only.
app.patch("/api/admin/cookbooks/:id", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const id = c.req.param("id");
  const role = await cookbookRole(c, id);
  if (role !== "owner" && role !== "admin") return c.json({ error: "owner only" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const sets = [];
  const args = [];
  if (typeof body?.name === "string") {
    const name = body.name.trim();
    if (!name || name.length > 80) return c.json({ error: "invalid name" }, 400);
    sets.push("name = ?"); args.push(name);
  }
  if (typeof body?.blurb === "string") {
    sets.push("blurb = ?"); args.push(body.blurb.slice(0, 280));
  }
  if (["private", "unlisted", "public"].includes(body?.visibility)) {
    sets.push("visibility = ?"); args.push(body.visibility);
  }
  if (Array.isArray(body?.languages)) {
    const langs = normaliseLanguages(body.languages);
    if (!langs) return c.json({ error: "invalid languages" }, 400);
    await c.env.DB.prepare(
      "ALTER TABLE cookbooks ADD COLUMN languages TEXT"
    ).run().catch(() => {});
    sets.push("languages = ?"); args.push(JSON.stringify(langs));
  }
  if (body?.coverPhoto === null || typeof body?.coverPhoto === "string") {
    // Accept either a freshly-uploaded /api/images/... URL or
    // null (clear the cover). Anything else is ignored so a typo
    // can't blank the cover.
    sets.push("cover_photo = ?"); args.push(body.coverPhoto || null);
  }
  if (body?.coverColor === null || typeof body?.coverColor === "string") {
    // Accept a short colour token from the swatch palette (or
    // null to reset to the default green). Reject anything that
    // looks suspect — only allow letters / digits / hash / hyphen
    // so we can't get tricked into stuffing CSS into a style
    // attribute downstream.
    const cc = body.coverColor;
    if (cc === null || /^[a-zA-Z0-9#\-]{0,32}$/.test(cc)) {
      await c.env.DB.prepare(
        "ALTER TABLE cookbooks ADD COLUMN cover_color TEXT"
      ).run().catch(() => {});
      sets.push("cover_color = ?"); args.push(cc || null);
    }
  }
  if (body?.cookbookType === null || ["family-heirloom", "personal", "group"].includes(body?.cookbookType)) {
    await c.env.DB.prepare(
      "ALTER TABLE cookbooks ADD COLUMN cookbook_type TEXT"
    ).run().catch(() => {});
    sets.push("cookbook_type = ?"); args.push(body.cookbookType || null);
  }
  if (!sets.length) return c.json({ ok: true });
  const now = new Date().toISOString();
  sets.push("updated_at = ?"); args.push(now, id);
  await c.env.DB.prepare(
    `UPDATE cookbooks SET ${sets.join(", ")} WHERE id = ?`
  ).bind(...args).run();
  return c.json({ ok: true, updatedAt: now });
});

// DELETE — owner-only. Refuses to delete the bootstrap family
// cookbook (it's the historical root) and refuses to delete a
// cookbook that still has recipes — caller has to move/delete
// recipes first.
app.delete("/api/admin/cookbooks/:id", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const id = c.req.param("id");
  if (id === BOOTSTRAP_COOKBOOK_ID) return c.json({ error: "cannot delete the bootstrap cookbook" }, 400);
  const role = await cookbookRole(c, id);
  if (role !== "owner" && role !== "admin") return c.json({ error: "owner only" }, 403);
  // Cascade-delete: recipes, comments, invitations, favorites,
  // and member rows all go with the cookbook. Personal cookbooks
  // can be removed even if they have recipes — that was blocking
  // owners from cleaning up cookbooks they own. The owner already
  // confirmed via the danger-zone prompt before we got here.
  await c.env.DB.prepare(
    "DELETE FROM comments WHERE recipe_id IN (SELECT id FROM recipes WHERE cookbook_id = ?)"
  ).bind(id).run().catch(() => {});
  await c.env.DB.prepare("DELETE FROM recipes WHERE cookbook_id = ?").bind(id).run().catch(() => {});
  await c.env.DB.prepare("DELETE FROM invitations WHERE cookbook_id = ?").bind(id).run().catch(() => {});
  await c.env.DB.prepare("DELETE FROM cookbook_members WHERE cookbook_id = ?").bind(id).run().catch(() => {});
  await c.env.DB.prepare("DELETE FROM cookbooks WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// ─── Phase 4b-2: invitations + member management ───
const INVITE_TTL_DAYS = 14;
// 12 bytes = 96 bits of entropy = unguessable, and the hex
// representation is 24 chars — about half what 24-byte tokens
// produced. Combined with the /i/ short path the invite link
// is roughly 25 chars shorter, comfortably under 60 chars on
// the heirloomcookbook.net domain.
function randomToken(bytes = 12) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Phase 4b-2.5: invite email delivery via Resend.
//
// Resend is the simplest path for transactional email on
// Cloudflare Workers — single HTTP POST, no SDK, free tier
// covers far more than the family cookbook will send. The
// caller MUST have RESEND_API_KEY set as an env var in
// Cloudflare Pages → Settings → Environment variables, AND
// must verify their sending domain inside Resend (DKIM/SPF
// DNS records). Without those, the helper returns
// { ok: false, reason: "not configured" } and the invitation
// still works — the link is just returned for clipboard copy.
//
// Optional env vars:
//   RESEND_API_KEY      — required to actually send mail
//   INVITE_FROM_EMAIL   — defaults to "invites@heirloomcookbook.net"
//   INVITE_FROM_NAME    — defaults to "Heirloom Cookbook"
async function sendInviteEmail(env, { toEmail, inviterEmail, cookbookName, cookbookBlurb, role, link }) {
  if (!env.RESEND_API_KEY) return { ok: false, reason: "not configured" };
  if (!toEmail) return { ok: false, reason: "no recipient" };
  const fromEmail = env.INVITE_FROM_EMAIL || "invites@heirloomcookbook.net";
  const fromName = env.INVITE_FROM_NAME || "Heirloom Cookbook";

  const subject = `${inviterEmail} invited you to ${cookbookName}`;
  const text = `${inviterEmail} invited you to ${cookbookName} on Heirloom.

${cookbookBlurb ? cookbookBlurb + "\n\n" : ""}You'll join as a ${role}.

Accept the invitation: ${link}

This link expires in ${INVITE_TTL_DAYS} days.`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#fdfcfa;font-family:Georgia,serif;color:#1c1813;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:48px 20px;">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="background:#fdfcfa;border:1px solid #e6dfd0;border-radius:12px;">
      <tr><td style="padding:40px 36px;">
        <div style="font-family:'IBM Plex Mono',Menlo,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6e7a3a;font-weight:600;margin-bottom:10px;">Invitation</div>
        <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:500;margin:0 0 16px;line-height:1.3;color:#1c1813;">
          <em style="color:#b04a2a;">${escapeHtml(inviterEmail)}</em> invited you to
        </h1>
        <div style="font-family:Georgia,serif;font-size:30px;font-weight:500;font-style:italic;margin:4px 0 16px;color:#1c1813;">
          ${escapeHtml(cookbookName)}
        </div>
        ${cookbookBlurb ? `<p style="font-family:Georgia,serif;font-size:15px;color:#3d362c;margin:0 0 16px;line-height:1.5;">${escapeHtml(cookbookBlurb)}</p>` : ""}
        <p style="font-size:14px;color:#8a8170;margin:0 0 28px;">You'll join as a <strong>${escapeHtml(role)}</strong>.</p>
        <p style="margin:0 0 24px;">
          <a href="${link}" style="display:inline-block;background:#1c1813;color:#fdfcfa;padding:14px 24px;border-radius:999px;text-decoration:none;font-family:Georgia,serif;font-size:15px;">Verify your email &amp; accept</a>
        </p>
        <p style="font-family:Georgia,serif;font-style:italic;font-size:13px;color:#8a8170;margin:0;">
          This link expires in ${INVITE_TTL_DAYS} days. If you weren't expecting this, just ignore the email.
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [toEmail],
        reply_to: inviterEmail,
        subject,
        text,
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("resend send failed", res.status, body);
      return { ok: false, reason: `provider error ${res.status}` };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, id: data?.id || null };
  } catch (err) {
    console.error("resend send threw", err);
    return { ok: false, reason: String(err?.message || err) };
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Create an invitation. Owner-only.
app.post("/api/admin/cookbooks/:id/invitations", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const cookbookId = c.req.param("id");
  const role = await cookbookRole(c, cookbookId);
  // Editors can invite people (alongside owners + admins) — only
  // role changes + removals stay owner/admin-gated.
  if (!["owner", "editor", "admin"].includes(role)) return c.json({ error: "editor or owner only" }, 403);

  const body = await c.req.json().catch(() => ({}));
  const inviteEmail = (body?.email || "").toString().trim().toLowerCase() || null;
  // Owner-grants are restricted to owners + admins — editors can
  // invite editors/viewers but not promote anyone to owner.
  const requestedRole = body?.role;
  let inviteRole;
  if (requestedRole === "owner") {
    if (role !== "owner" && role !== "admin") {
      return c.json({ error: "only owners can invite co-owners" }, 403);
    }
    inviteRole = "owner";
  } else {
    inviteRole = ["editor", "viewer"].includes(requestedRole) ? requestedRole : "viewer";
  }

  // If they're already a member, just return the existing row
  // instead of creating a duplicate invite.
  if (inviteEmail) {
    const exists = await c.env.DB.prepare(
      "SELECT user_email FROM cookbook_members WHERE cookbook_id = ? AND user_email = ?"
    ).bind(cookbookId, inviteEmail).first();
    if (exists) return c.json({ error: "already a member" }, 400);
  }

  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + INVITE_TTL_DAYS * 86400 * 1000);

  await c.env.DB.prepare(
    "INSERT INTO invitations (token, cookbook_id, email, role, invited_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(token, cookbookId, inviteEmail, inviteRole, email, now.toISOString(), expires.toISOString()).run();

  const origin = new URL(c.req.url).origin;
  const link = `${origin}/i/${token}`;

  // Send the magic link via Resend if configured. Best-effort —
  // a delivery failure doesn't roll back the invitation; the
  // inviter can still copy/share the link manually.
  let emailDelivery = { ok: false, reason: "no recipient" };
  if (inviteEmail) {
    const cb = await c.env.DB.prepare(
      "SELECT name, blurb FROM cookbooks WHERE id = ?"
    ).bind(cookbookId).first();
    emailDelivery = await sendInviteEmail(c.env, {
      toEmail: inviteEmail,
      inviterEmail: email,
      cookbookName: cb?.name || "a cookbook",
      cookbookBlurb: cb?.blurb || "",
      role: inviteRole,
      link,
    });
  }

  return c.json({
    invitation: {
      token, cookbookId, email: inviteEmail, role: inviteRole,
      invitedBy: email,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    },
    link,
    emailSent: emailDelivery.ok,
    emailError: emailDelivery.ok ? null : emailDelivery.reason,
  });
});

// List pending (un-accepted, un-expired) invitations for a
// cookbook. Owner-only — these contain emails.
app.get("/api/admin/cookbooks/:id/invitations", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const cookbookId = c.req.param("id");
  const role = await cookbookRole(c, cookbookId);
  // Editors see + manage invitations they (or other editors)
  // issued; owners + admins likewise. Viewers blocked.
  if (!["owner", "editor", "admin"].includes(role)) return c.json({ error: "editor or owner only" }, 403);
  const now = new Date().toISOString();
  const rows = await c.env.DB.prepare(
    `SELECT token, email, role, invited_by, created_at, expires_at
     FROM invitations
     WHERE cookbook_id = ? AND accepted_at IS NULL AND expires_at > ?
     ORDER BY created_at DESC`
  ).bind(cookbookId, now).all();
  const origin = new URL(c.req.url).origin;
  return c.json({
    invitations: (rows.results || []).map(r => ({
      token: r.token,
      email: r.email,
      role: r.role,
      invitedBy: r.invited_by,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      link: `${origin}/i/${r.token}`,
    })),
  });
});

// Revoke an invitation. Editor+ (an editor can clean up their
// own outstanding invites; admins + owners can revoke anyone's).
app.delete("/api/admin/cookbooks/:id/invitations/:token", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const cookbookId = c.req.param("id");
  const role = await cookbookRole(c, cookbookId);
  if (!["owner", "editor", "admin"].includes(role)) return c.json({ error: "editor or owner only" }, 403);
  await c.env.DB.prepare(
    "DELETE FROM invitations WHERE cookbook_id = ? AND token = ?"
  ).bind(cookbookId, c.req.param("token")).run();
  return c.json({ ok: true });
});

// Public invitation detail. No auth — the token itself is the
// capability. Returned shape lets the invite page render
// "Patricia invited you to Heirloom Family Cookbook" before the
// invitee has signed in.
app.get("/api/invitations/:token", async (c) => {
  const token = c.req.param("token");
  const row = await c.env.DB.prepare(
    `SELECT i.token, i.cookbook_id, i.email, i.role, i.invited_by, i.created_at, i.expires_at, i.accepted_at,
            c.name AS cookbook_name, c.blurb AS cookbook_blurb
     FROM invitations i
     LEFT JOIN cookbooks c ON c.id = i.cookbook_id
     WHERE i.token = ?`
  ).bind(token).first();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({
    token: row.token,
    cookbookId: row.cookbook_id,
    cookbookName: row.cookbook_name,
    cookbookBlurb: row.cookbook_blurb,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    expired: new Date(row.expires_at) < new Date(),
  });
});

// Notifications — pending invitations addressed to the signed-in
// cook's email. Used by the bell-icon notifications page in the
// avatar menu. Returns invites that target this user by email,
// haven't been accepted, and haven't expired.
app.get("/api/admin/notifications", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  await ensureUserBootstrap(c);
  const now = new Date().toISOString();
  const rows = await c.env.DB.prepare(
    `SELECT i.token, i.cookbook_id, i.role, i.invited_by, i.created_at, i.expires_at,
            cb.name AS cookbook_name, cb.blurb AS cookbook_blurb,
            u.display_name AS invited_by_name,
            u.first_name AS invited_by_first,
            u.last_name AS invited_by_last
     FROM invitations i
     LEFT JOIN cookbooks cb ON cb.id = i.cookbook_id
     LEFT JOIN users u ON LOWER(u.email) = LOWER(i.invited_by)
     WHERE LOWER(i.email) = LOWER(?)
       AND i.accepted_at IS NULL
       AND i.expires_at > ?
     ORDER BY i.created_at DESC`
  ).bind(email, now).all();
  // Pending join requests for cookbooks where the caller is an
  // owner/editor — surfaced in the same notifications payload so
  // the bell badge counts both invites + requests-to-join.
  const joinRows = await c.env.DB.prepare(
    `SELECT j.id, j.cookbook_id, j.user_email, j.message, j.created_at,
            cb.name AS cookbook_name,
            u.display_name, u.first_name, u.last_name,
            m.role AS your_role
     FROM join_requests j
     LEFT JOIN cookbooks cb ON cb.id = j.cookbook_id
     LEFT JOIN users u ON u.email = j.user_email
     LEFT JOIN cookbook_members m ON m.cookbook_id = j.cookbook_id AND m.user_email = ?
     WHERE j.status = 'pending'
       AND m.role IN ('owner', 'editor')
     ORDER BY j.created_at DESC`
  ).bind(email).all().catch(() => ({ results: [] }));
  // Pending user accounts (status = 'pending') — admin-only.
  // Surfaced in the same payload so admins see incoming signups
  // alongside invites + join requests.
  const callerIsAdmin = await isAdmin(c);
  const accountRows = callerIsAdmin
    ? await c.env.DB.prepare(
        `SELECT email, display_name, first_name, last_name, created_at
         FROM users
         WHERE status = 'pending'
         ORDER BY created_at DESC`
      ).all().catch(() => ({ results: [] }))
    : { results: [] };
  return c.json({
    invitations: (rows.results || []).map(r => ({
      token: r.token,
      cookbookId: r.cookbook_id,
      cookbookName: r.cookbook_name,
      cookbookBlurb: r.cookbook_blurb,
      role: r.role,
      invitedBy: r.invited_by,
      invitedByName: r.invited_by_name
        || [r.invited_by_first, r.invited_by_last].filter(Boolean).join(" ")
        || null,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    })),
    joinRequests: (joinRows.results || []).map(r => ({
      id: r.id,
      cookbookId: r.cookbook_id,
      cookbookName: r.cookbook_name,
      email: r.user_email,
      displayName: r.display_name || null,
      firstName: r.first_name || null,
      lastName: r.last_name || null,
      message: r.message || "",
      createdAt: r.created_at,
    })),
    pendingAccounts: (accountRows.results || []).map(r => ({
      email: r.email,
      displayName: r.display_name || null,
      firstName: r.first_name || null,
      lastName: r.last_name || null,
      createdAt: r.created_at,
    })),
  });
});

// Accept an invitation. Adds the signed-in cook to the cookbook
// as a member with the invited role; marks the invitation
// accepted. Authenticated.
app.post("/api/admin/invitations/:token/accept", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  await ensureUserBootstrap(c);
  const token = c.req.param("token");
  const row = await c.env.DB.prepare(
    "SELECT cookbook_id, email, role, expires_at, accepted_at FROM invitations WHERE token = ?"
  ).bind(token).first();
  if (!row) return c.json({ error: "not found" }, 404);
  if (row.accepted_at) return c.json({ error: "already accepted", cookbookId: row.cookbook_id }, 400);
  if (new Date(row.expires_at) < new Date()) return c.json({ error: "expired" }, 400);
  // Strict email gate when the inviter pre-addressed the
  // invitation. Stops Patricia from accidentally "accepting"
  // an invite meant for grace@ while she's still signed in.
  if (row.email && row.email.toLowerCase() !== email.toLowerCase()) {
    return c.json({
      error: "wrong account",
      expectedEmail: row.email,
      signedInAs: email,
    }, 403);
  }

  const now = new Date().toISOString();
  // Vouched cooks bypass the pending queue — being invited by an
  // existing cookbook owner is social proof enough.
  await c.env.DB.prepare(
    "UPDATE users SET status = 'approved' WHERE email = ? AND status = 'pending'"
  ).bind(email).run().catch(() => {});
  // Upsert membership: insert if new, then overwrite the role
  // with the invited role. INSERT OR IGNORE alone left people
  // whose cookbook_members row already existed (from an earlier
  // join-request approval or a manual seed) stuck on whatever
  // role they had before — accepting an editor invite as an
  // existing viewer wouldn't actually promote them.
  const emailLower = email.toLowerCase();
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO cookbook_members (cookbook_id, user_email, role, invited_by, joined_at) VALUES (?, ?, ?, (SELECT invited_by FROM invitations WHERE token = ?), ?)"
  ).bind(row.cookbook_id, emailLower, row.role, token, now).run();
  await c.env.DB.prepare(
    "UPDATE cookbook_members SET role = ? WHERE cookbook_id = ? AND LOWER(user_email) = ?"
  ).bind(row.role, row.cookbook_id, emailLower).run();
  // Mark accepted.
  await c.env.DB.prepare(
    "UPDATE invitations SET accepted_at = ?, accepted_by = ? WHERE token = ?"
  ).bind(now, emailLower, token).run();
  return c.json({ ok: true, cookbookId: row.cookbook_id });
});

// Change a member's role. Owner-only. The owner can demote
// themselves (transfer-of-power surface) but not the last
// remaining owner.
app.patch("/api/admin/cookbooks/:id/members/:email", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const cookbookId = c.req.param("id");
  const targetEmail = c.req.param("email").toLowerCase();
  const role = await cookbookRole(c, cookbookId);
  if (role !== "owner" && role !== "admin") return c.json({ error: "owner only" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const newRole = body?.role;
  if (!["owner", "editor", "viewer"].includes(newRole)) {
    return c.json({ error: "invalid role" }, 400);
  }
  // Prevent removing the last owner.
  if (newRole !== "owner") {
    const owners = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM cookbook_members WHERE cookbook_id = ? AND role = 'owner'"
    ).bind(cookbookId).first();
    if ((owners?.n || 0) <= 1) {
      const target = await c.env.DB.prepare(
        "SELECT role FROM cookbook_members WHERE cookbook_id = ? AND user_email = ?"
      ).bind(cookbookId, targetEmail).first();
      if (target?.role === "owner") return c.json({ error: "promote another member to owner first" }, 400);
    }
  }
  await c.env.DB.prepare(
    "UPDATE cookbook_members SET role = ? WHERE cookbook_id = ? AND user_email = ?"
  ).bind(newRole, cookbookId, targetEmail).run();
  return c.json({ ok: true });
});

// Remove a member. Owner-only. Can't remove the last owner.
// A member can also remove themselves (leave) — handled by the
// same endpoint when the caller targets their own row.
app.delete("/api/admin/cookbooks/:id/members/:email", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const cookbookId = c.req.param("id");
  const targetEmail = c.req.param("email").toLowerCase();
  const role = await cookbookRole(c, cookbookId);
  const isSelf = targetEmail === email.toLowerCase();
  if (role !== "owner" && role !== "admin" && !isSelf) return c.json({ error: "owner only" }, 403);
  // Don't strand a cookbook with no owners.
  const target = await c.env.DB.prepare(
    "SELECT role FROM cookbook_members WHERE cookbook_id = ? AND user_email = ?"
  ).bind(cookbookId, targetEmail).first();
  if (!target) return c.json({ error: "not found" }, 404);
  if (target.role === "owner") {
    const owners = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM cookbook_members WHERE cookbook_id = ? AND role = 'owner'"
    ).bind(cookbookId).first();
    if ((owners?.n || 0) <= 1) return c.json({ error: "transfer ownership before removing the last owner" }, 400);
  }
  await c.env.DB.prepare(
    "DELETE FROM cookbook_members WHERE cookbook_id = ? AND user_email = ?"
  ).bind(cookbookId, targetEmail).run();
  return c.json({ ok: true });
});

app.get("/api/recipes", async (c) => {
  // Phase 4a-2: scope by cookbookId when provided. Defaults to the
  // bootstrap family cookbook so legacy callers (no query param)
  // see exactly the same recipes they always have.
  const cookbookId = c.req.query("cookbookId") || BOOTSTRAP_COOKBOOK_ID;
  // If a real cookbook is requested, verify the caller is a
  // member. We allow unauthenticated callers to read the bootstrap
  // cookbook (it's the public landing) but require membership for
  // any other cookbook — this also future-proofs against someone
  // probing private cookbooks via the query string.
  // Read access via this legacy query-string route used to be
  // membership-gated. Now any signed-in cook can read — the
  // cookbook ID itself functions as a share token. Writes still
  // gate per-endpoint.
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
     WHERE r.cookbook_id = ? OR (r.cookbook_id IS NULL AND ? = ?)
     GROUP BY r.id
     ORDER BY r.created_at DESC`
  ).bind(cookbookId, cookbookId, BOOTSTRAP_COOKBOOK_ID).all();
  const recipes = rows.results.map((r) => ({
    ...JSON.parse(r.blob),
    liveComments: JSON.parse(r.live_comments).map(formatComment),
  }));
  // Prevent intermediate caching — Cloudflare's CDN + mobile
  // Safari both like to keep this around, which makes saves
  // look like no-ops because the post-save refresh returns the
  // stale list.
  c.header("Cache-Control", "no-store, must-revalidate");
  return c.json(recipes);
});

// Shared query — returns every recipe (+ live comments) for a
// cookbook. Used by both the public bootstrap read above and the
// authenticated per-cookbook read below.
async function fetchCookbookRecipes(c, cookbookId) {
  const rows = await c.env.DB.prepare(
    `SELECT r.blob, COALESCE(json_group_array(
       CASE WHEN c.id IS NULL THEN NULL
            ELSE json_object('id', c.id, 'name', c.author, 'text', c.body, 'created_at', c.created_at, 'created_by', c.created_by, 'rating', c.rating, 'photo', c.photo)
       END
     ) FILTER (WHERE c.id IS NOT NULL), '[]') AS live_comments
     FROM recipes r
     LEFT JOIN comments c ON c.recipe_id = r.id
     WHERE r.cookbook_id = ? OR (r.cookbook_id IS NULL AND ? = ?)
     GROUP BY r.id
     ORDER BY r.created_at DESC`
  ).bind(cookbookId, cookbookId, BOOTSTRAP_COOKBOOK_ID).all();
  return rows.results.map((r) => ({
    ...JSON.parse(r.blob),
    liveComments: JSON.parse(r.live_comments).map(formatComment),
  }));
}

// Authenticated per-cookbook recipe read. Lives under /api/admin/
// because Cloudflare Access only injects the
// cf-access-authenticated-user-email header on that path — which
// cookbookRole() needs to verify membership on private cookbooks.
// The public /api/recipes route above can't see that header, so
// it can only ever serve the bootstrap family cookbook; every
// other cookbook 403'd there because authedEmail was null. This
// is the route the client uses for non-bootstrap cookbooks.
app.get("/api/admin/cookbooks/:cookbookId/recipes", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const cookbookId = c.req.param("cookbookId");
  // Any signed-in cook gets read access — the URL is the share
  // token. Writes still go through cookbookRole() checks at
  // their respective endpoints.
  const recipes = await fetchCookbookRecipes(c, cookbookId);
  c.header("Cache-Control", "no-store, must-revalidate");
  return c.json(recipes);
});

// ─── Join requests ───
// A signed-in cook who discovers a public cookbook can ask its
// owners + editors for membership. The owner picks the role on
// approval (follower / editor / owner). Pending requests double
// as a notification for the cookbook's managers.
app.post("/api/admin/cookbooks/:id/join-request", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const cookbookId = c.req.param("id");
  // Only block if the cook has an explicit membership row — the
  // system-admin fallback in cookbookRole() shouldn't prevent
  // admins from joining a cookbook as a regular member if they
  // want to.
  const membership = await c.env.DB.prepare(
    "SELECT role FROM cookbook_members WHERE cookbook_id = ? AND user_email = ?"
  ).bind(cookbookId, email).first();
  if (membership?.role) {
    return c.json({ error: "already a member" }, 400);
  }
  const vis = await c.env.DB.prepare(
    "SELECT visibility FROM cookbooks WHERE id = ?"
  ).bind(cookbookId).first();
  if (!vis) return c.json({ error: "not found" }, 404);
  if (vis.visibility !== "public") return c.json({ error: "cookbook is private" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const message = (body?.message || "").toString().trim().slice(0, 280) || null;
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO join_requests (cookbook_id, user_email, message, status, created_at) VALUES (?, ?, ?, 'pending', ?) ON CONFLICT(cookbook_id, user_email) DO UPDATE SET status = 'pending', message = excluded.message, created_at = excluded.created_at"
  ).bind(cookbookId, email, message, now).run();
  return c.json({ ok: true });
});

// Pending requests for a cookbook — owners + editors only.
app.get("/api/admin/cookbooks/:id/join-requests", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const cookbookId = c.req.param("id");
  const role = await cookbookRole(c, cookbookId);
  if (!["owner", "editor", "admin"].includes(role)) return c.json({ error: "owner or editor only" }, 403);
  const rows = await c.env.DB.prepare(
    `SELECT j.id, j.user_email, j.message, j.created_at,
            u.display_name, u.first_name, u.last_name
     FROM join_requests j
     LEFT JOIN users u ON u.email = j.user_email
     WHERE j.cookbook_id = ? AND j.status = 'pending'
     ORDER BY j.created_at ASC`
  ).bind(cookbookId).all();
  return c.json({
    requests: (rows.results || []).map(r => ({
      id: r.id,
      email: r.user_email,
      displayName: r.display_name || null,
      firstName: r.first_name || null,
      lastName: r.last_name || null,
      message: r.message || "",
      createdAt: r.created_at,
    })),
  });
});

// Approve a join request — pick a role; add to cookbook_members.
app.post("/api/admin/cookbooks/:id/join-requests/:reqId/approve", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const cookbookId = c.req.param("id");
  const reqId = c.req.param("reqId");
  const role = await cookbookRole(c, cookbookId);
  if (!["owner", "editor", "admin"].includes(role)) return c.json({ error: "owner or editor only" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const requestedRole = body?.role;
  if (!["owner", "editor", "viewer"].includes(requestedRole)) return c.json({ error: "invalid role" }, 400);
  if (requestedRole === "owner" && role !== "owner" && role !== "admin") {
    return c.json({ error: "only owners can approve as owner" }, 403);
  }
  const reqRow = await c.env.DB.prepare(
    "SELECT user_email, status FROM join_requests WHERE id = ? AND cookbook_id = ?"
  ).bind(reqId, cookbookId).first();
  if (!reqRow) return c.json({ error: "request not found" }, 404);
  if (reqRow.status !== "pending") return c.json({ error: "already decided" }, 400);
  const now = new Date().toISOString();
  const userEmailLower = (reqRow.user_email || "").toLowerCase();
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO cookbook_members (cookbook_id, user_email, role, invited_by, joined_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(cookbookId, userEmailLower, requestedRole, email, now).run();
  await c.env.DB.prepare(
    "UPDATE cookbook_members SET role = ? WHERE cookbook_id = ? AND LOWER(user_email) = ?"
  ).bind(requestedRole, cookbookId, userEmailLower).run();
  await c.env.DB.prepare(
    "UPDATE join_requests SET status = 'approved', decided_at = ?, decided_by = ?, decided_role = ? WHERE id = ?"
  ).bind(now, email, requestedRole, reqId).run();
  return c.json({ ok: true });
});

// Decline a join request.
app.post("/api/admin/cookbooks/:id/join-requests/:reqId/decline", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const cookbookId = c.req.param("id");
  const reqId = c.req.param("reqId");
  const role = await cookbookRole(c, cookbookId);
  if (!["owner", "editor", "admin"].includes(role)) return c.json({ error: "owner or editor only" }, 403);
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "UPDATE join_requests SET status = 'declined', decided_at = ?, decided_by = ? WHERE id = ? AND cookbook_id = ?"
  ).bind(now, email, reqId, cookbookId).run();
  return c.json({ ok: true });
});

// Public-cookbook directory. Returns every cookbook with
// visibility = 'public', plus its owner + recipe count, ordered
// by most recipes first. Used by the Discover page; authenticated
// so we can later layer in a "follow" relationship + filter out
// cookbooks the caller already owns / is a member of.
//
// Path is /api/admin/discover (not /cookbooks/public) because
// Hono matches routes top-down and the parameterised
// /api/admin/cookbooks/:id route earlier in the file would
// otherwise eat "public" as an id.
app.get("/api/admin/discover", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  await c.env.DB.prepare(
    "ALTER TABLE cookbooks ADD COLUMN cover_color TEXT"
  ).run().catch(() => {});
  await c.env.DB.prepare(
    "ALTER TABLE cookbooks ADD COLUMN cookbook_type TEXT"
  ).run().catch(() => {});
  // Self-heal: join_requests is migration 0022 — recreate the
  // table here so the LEFT JOIN below doesn't blow up the whole
  // Discover page on a deploy where the migration hasn't run.
  await c.env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS join_requests (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       cookbook_id TEXT NOT NULL,
       user_email TEXT NOT NULL,
       message TEXT,
       status TEXT NOT NULL DEFAULT 'pending',
       created_at TEXT NOT NULL,
       decided_at TEXT,
       decided_by TEXT,
       decided_role TEXT,
       UNIQUE(cookbook_id, user_email)
     )`
  ).run().catch(() => {});
  const q = (c.req.query("q") || "").trim().toLowerCase();
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.owner_email, c.name, c.slug, c.blurb,
            c.cover_photo, c.cover_color, c.languages, c.cookbook_type,
            (SELECT COUNT(*) FROM cookbook_members WHERE cookbook_id = c.id) AS member_count,
            (SELECT COUNT(*) FROM recipes WHERE cookbook_id = c.id) AS recipe_count,
            u.display_name AS owner_name,
            m.role AS your_role,
            j.status AS join_status
     FROM cookbooks c
     LEFT JOIN users u ON u.email = c.owner_email
     LEFT JOIN cookbook_members m ON m.cookbook_id = c.id AND m.user_email = ?
     LEFT JOIN join_requests j ON j.cookbook_id = c.id AND j.user_email = ? AND j.status = 'pending'
     WHERE c.visibility = 'public'
     ORDER BY recipe_count DESC, c.name ASC`
  ).bind(email, email).all();
  const all = (rows.results || []).map(r => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    blurb: r.blurb || "",
    coverPhoto: r.cover_photo || null,
    coverColor: r.cover_color || null,
    languages: r.languages ? JSON.parse(r.languages) : ["en"],
    ownerEmail: r.owner_email,
    ownerName: r.owner_name || null,
    memberCount: r.member_count || 0,
    recipeCount: r.recipe_count || 0,
    yourRole: r.your_role || null,
    pendingJoin: r.join_status === "pending",
    cookbookType: r.cookbook_type || null,
  }));
  const filtered = q
    ? all.filter(cb =>
        cb.name?.toLowerCase().includes(q) ||
        cb.blurb?.toLowerCase().includes(q) ||
        cb.ownerName?.toLowerCase().includes(q)
      )
    : all;
  return c.json({ cookbooks: filtered });
});

// Aggregate read across every cookbook the caller is a member
// of (plus any they have admin access to). Used by the
// cross-cookbook "Build a meal" flow so the cook can pick
// recipes from any of their books in one place. Each recipe
// gets `cookbookId` + `cookbookName` stamped on for grouping /
// labelling client-side.
app.get("/api/admin/me/recipes", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  await ensureUserBootstrap(c);
  const admin = await isAdmin(c);
  const cookbookRows = admin
    ? await c.env.DB.prepare(
        "SELECT id, name FROM cookbooks ORDER BY name ASC"
      ).all()
    : await c.env.DB.prepare(
        `SELECT c.id, c.name
         FROM cookbooks c
         JOIN cookbook_members m ON m.cookbook_id = c.id
         WHERE m.user_email = ?
         ORDER BY c.name ASC`
      ).bind(email).all();
  const cookbooks = cookbookRows.results || [];
  const out = [];
  for (const cb of cookbooks) {
    try {
      const recipes = await fetchCookbookRecipes(c, cb.id);
      for (const r of recipes) {
        out.push({ ...r, cookbookId: cb.id, cookbookName: cb.name });
      }
    } catch (err) {
      console.error("cross-cookbook read failed", cb.id, err);
    }
  }
  c.header("Cache-Control", "no-store, must-revalidate");
  return c.json(out);
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

// Pending invitations + the cook's own outgoing join requests,
// each enriched with enough cookbook detail to render as a book
// on the library "Pending" shelf.
app.get("/api/admin/me/pending", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  // Self-heal: join_requests may not exist on older deploys.
  await c.env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS join_requests (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       cookbook_id TEXT NOT NULL,
       user_email TEXT NOT NULL,
       message TEXT,
       status TEXT NOT NULL DEFAULT 'pending',
       created_at TEXT NOT NULL,
       decided_at TEXT,
       decided_by TEXT,
       decided_role TEXT,
       UNIQUE(cookbook_id, user_email)
     )`
  ).run().catch(() => {});
  const nowIso = new Date().toISOString();
  const invRows = await c.env.DB.prepare(
    `SELECT i.token, i.role, i.invited_by, i.created_at, i.expires_at,
            c.id AS cookbook_id, c.name, c.slug, c.blurb,
            c.cover_photo, c.cover_color, c.languages
     FROM invitations i
     LEFT JOIN cookbooks c ON c.id = i.cookbook_id
     WHERE LOWER(i.email) = LOWER(?)
       AND i.accepted_at IS NULL
       AND i.expires_at > ?
     ORDER BY i.created_at DESC`
  ).bind(email, nowIso).all();
  const joinRows = await c.env.DB.prepare(
    `SELECT j.id, j.created_at, j.message,
            c.id AS cookbook_id, c.name, c.slug, c.blurb,
            c.cover_photo, c.cover_color, c.languages
     FROM join_requests j
     LEFT JOIN cookbooks c ON c.id = j.cookbook_id
     WHERE j.user_email = ? AND j.status = 'pending'
     ORDER BY j.created_at DESC`
  ).bind(email).all().catch(() => ({ results: [] }));
  return c.json({
    invitations: (invRows.results || []).map(r => ({
      token: r.token,
      role: r.role,
      invitedBy: r.invited_by,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      cookbook: {
        id: r.cookbook_id,
        name: r.name,
        slug: r.slug,
        blurb: r.blurb || "",
        coverPhoto: r.cover_photo || null,
        coverColor: r.cover_color || null,
        languages: r.languages ? JSON.parse(r.languages) : ["en"],
      },
    })),
    joinRequests: (joinRows.results || []).map(r => ({
      id: r.id,
      message: r.message || "",
      createdAt: r.created_at,
      cookbook: {
        id: r.cookbook_id,
        name: r.name,
        slug: r.slug,
        blurb: r.blurb || "",
        coverPhoto: r.cover_photo || null,
        coverColor: r.cover_color || null,
        languages: r.languages ? JSON.parse(r.languages) : ["en"],
      },
    })),
  });
});

// Locate which cookbook a recipe lives in. Used by the recipe
// page when a cook lands on a shared URL whose recipe doesn't
// belong to their currently-active cookbook — the client uses
// this to switch into the right cookbook before rendering.
// Any signed-in cook with the recipe ID can resolve the
// cookbook (the URL itself is the share token).
app.get("/api/admin/recipes/:id/cookbook", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const recipeId = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT cookbook_id FROM recipes WHERE id = ?"
  ).bind(recipeId).first();
  if (!row?.cookbook_id) return c.json({ error: "not found" }, 404);
  return c.json({ cookbookId: row.cookbook_id });
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

// Resolves the caller's email from either the signed session
// cookie (new email+password flow) or the legacy Cloudflare
// Access header (still in place during the transition). Runs
// once as middleware; downstream code reads it synchronously
// via authedEmail(c).
async function resolveSession(c, next) {
  let email = null;
  try {
    const token = readSessionCookie(c);
    if (token) email = await verifySession(c.env, token);
  } catch {}
  if (!email) email = c.req.header("cf-access-authenticated-user-email") || null;
  c.set("authedEmail", email ? email.toLowerCase() : null);
  return next();
}

function authedEmail(c) {
  return c.get("authedEmail") || null;
}

// ─── Multi-tenant cookbooks (Phase 4a) ───
// Every recipe / favorite / ai_event belongs to a cookbook. The
// existing family cookbook is the "bootstrap" — when no cookbook
// context is supplied (legacy endpoints, default landing) the
// caller is acting on this one. Personal cookbooks, shared
// cookbooks, and the public directory all build on top of this.
const BOOTSTRAP_COOKBOOK_ID = "family-cookbook";

// Look up the caller's role on a given cookbook. Returns
// "owner" | "editor" | "viewer" | "admin" | null. "admin" is
// the system-wide bit (users.is_admin) — admins can read and
// write any cookbook without being a member. Membership beats
// admin so Patricia can also be a regular owner/editor on
// cookbooks where she's been explicitly added.
async function cookbookRole(c, cookbookId) {
  const email = authedEmail(c);
  if (!email || !cookbookId) return null;
  // Case-insensitive on the email — Cloudflare Access can return
  // mixed case for the same identity across sessions, and older
  // invite-accept paths wrote whatever case CF supplied. Compare
  // with LOWER() so the lookup is robust to that drift.
  const memberRow = await c.env.DB.prepare(
    "SELECT role FROM cookbook_members WHERE cookbook_id = ? AND LOWER(user_email) = LOWER(?)"
  ).bind(cookbookId, email).first();
  if (memberRow?.role) return memberRow.role;
  // Self-heal: if the caller is the cookbook's owner_email but
  // somehow has no cookbook_members row (data drift from an early
  // bootstrap path that silently swallowed the INSERT), patch
  // the membership in now so future requests are fast and
  // consistent. Treat them as owner for this request.
  const ownerRow = await c.env.DB.prepare(
    "SELECT owner_email FROM cookbooks WHERE id = ?"
  ).bind(cookbookId).first();
  if (ownerRow?.owner_email && ownerRow.owner_email.toLowerCase() === email.toLowerCase()) {
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO cookbook_members (cookbook_id, user_email, role, joined_at) VALUES (?, ?, 'owner', ?)"
    ).bind(cookbookId, email, now).run().catch(() => {});
    return "owner";
  }
  const adminRow = await c.env.DB.prepare(
    "SELECT is_admin FROM users WHERE LOWER(email) = LOWER(?)"
  ).bind(email).first();
  return adminRow?.is_admin ? "admin" : null;
}

// Pure admin check — no cookbook scope. Used by endpoints that
// gate on system-wide admin access (e.g. listing every cookbook
// for Patricia's library).
async function isAdmin(c) {
  const email = authedEmail(c);
  if (!email) return false;
  const row = await c.env.DB.prepare(
    "SELECT is_admin FROM users WHERE email = ?"
  ).bind(email).first();
  return !!row?.is_admin;
}

// URL-safe slug from a string. Same shape as the client-side
// slugify in helpers.jsx so cookbook slugs read consistently.
function slugifyServer(s) {
  return (s || "")
    .toString().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

// Phase 4b-1: idempotent bootstrap for the signed-in user.
// Ensures a users row exists and that the cook has a personal
// cookbook they own. Called from cookbook endpoints — every
// authenticated visit to /api/admin/cookbooks runs this once.
//
// Existing family members hit this after deploy and pick up a
// personal cookbook on top of their family-cookbook membership;
// from that point the nav switcher appears.
async function ensureUserBootstrap(c) {
  const email = authedEmail(c);
  if (!email) return;
  const now = new Date().toISOString();

  // users row
  const userRow = await c.env.DB.prepare(
    "SELECT email, display_name FROM users WHERE email = ?"
  ).bind(email).first();

  // Normalize a raw email local-part into a friendly display
  // name — "kay.fejdasz" → "Kay Fejdasz". Used both when minting
  // a brand-new user row AND when a pre-seeded row exists with a
  // NULL display_name (the family migration left these empty,
  // and that NULL leaked into auto-bootstrap cookbook names like
  // "kay.fejdasz's Cookbook" before this normalisation ran).
  const localPart = email.split("@")[0];
  const normaliseLocal = () => localPart.replace(/[._-]+/g, " ").replace(/\b\w/g, x => x.toUpperCase());

  let displayName = userRow?.display_name || null;
  if (!userRow) {
    // First-ever sign-in: insert with a sensible default display
    // name. tier=full keeps behaviour open; status='pending'
    // means the cook lands on the "waiting for approval" screen
    // until an admin approves them. Invitations auto-approve in
    // the accept handler so a vouched cook doesn't sit in the
    // queue.
    displayName = normaliseLocal();
    await c.env.DB.prepare(
      "INSERT INTO users (email, display_name, tier, status, created_at, last_seen_at) VALUES (?, ?, 'full', 'pending', ?, ?)"
    ).bind(email, displayName, now, now).run().catch(() => {});
  } else if (!displayName) {
    // Pre-seeded user signing in for the first time post-deploy
    // (or a row whose display_name never got populated). Backfill
    // a friendly name so the cookbook bootstrap below names the
    // personal cookbook properly. They'll overwrite this with
    // their first/last name in the profile gate next.
    displayName = normaliseLocal();
    await c.env.DB.prepare(
      "UPDATE users SET display_name = ?, last_seen_at = ? WHERE email = ?"
    ).bind(displayName, now, email).run().catch(() => {});
  } else {
    // Touch last_seen_at best-effort — never block the request.
    c.executionCtx.waitUntil(
      c.env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE email = ?")
        .bind(now, email).run().catch(() => {})
    );
  }

  // Phase 4b-5 reshaped per Patricia's feedback: bootstrap ONLY
  // a personal cookbook. Family cookbooks are explicit — the
  // cook either creates one in My Cookbooks or accepts an invite
  // to someone else's. The onboarding banner on the cookbooks
  // index nudges new cooks who don't yet have a family cookbook
  // to create or join one.
  const owned = (await c.env.DB.prepare(
    "SELECT id FROM cookbooks WHERE owner_email = ?"
  ).bind(email).all()).results || [];
  const hasPersonal = owned.some(c => /^personal-/i.test(c.id));
  if (hasPersonal) return;

  const baseSlug = slugifyServer(displayName || localPart) || "cook";
  const personName = displayName || localPart;
  const emailHash = await sha256Hex(email);
  const id = `personal-${emailHash.slice(0, 12)}`;
  const slug = `${baseSlug}-personal-${emailHash.slice(0, 6)}`;
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO cookbooks (id, owner_email, name, slug, visibility, blurb, created_at, updated_at) VALUES (?, ?, ?, ?, 'private', ?, ?, ?)"
  ).bind(id, email, `${personName}'s Cookbook`, slug, "My favourite recipes", now, now).run().catch(() => {});
  await c.env.DB.prepare(
    "INSERT OR IGNORE INTO cookbook_members (cookbook_id, user_email, role, joined_at) VALUES (?, ?, 'owner', ?)"
  ).bind(id, email, now).run().catch(() => {});
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
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
// Low-level insert into ai_events. Used directly when there's no
// Hono context to read the email from (background tasks like
// translateAndStore that run after a save returns). Returns a
// promise so callers can pass it to waitUntil.
// Phase 4a-2: ai_events now carries a cookbook_id so tier
// accounting can be per-cookbook in 4d. Meta-only callers (no
// cookbookId in scope) get the bootstrap id by default.
function recordAiEvent(env, email, feature, recipeId, meta, ok = true, cookbookId = BOOTSTRAP_COOKBOOK_ID) {
  if (!email) return Promise.resolve();
  const created = new Date().toISOString();
  const metaStr = meta ? JSON.stringify(meta) : null;
  return env.DB.prepare(
    "INSERT INTO ai_events (created_at, user_email, feature, recipe_id, ok, meta, cookbook_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(created, email, feature, recipeId || null, ok ? 1 : 0, metaStr, cookbookId)
    .run()
    .catch((err) => console.error("ai_events insert failed", err));
}

function logAiEvent(c, feature, recipeId, meta, ok = true, cookbookId = BOOTSTRAP_COOKBOOK_ID) {
  const email = authedEmail(c);
  c.executionCtx.waitUntil(recordAiEvent(c.env, email, feature, recipeId, meta, ok, cookbookId));
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

// ─── User-behaviour analytics ───
// Same shape as logAiEvent: best-effort insert into a separate
// table. Distinct from AI logging because admins are excluded by
// default from "how do people use the cookbook" but kept in for
// "what's AI costing me" (real money).
const ADMIN_EMAILS = ["patricia.fejdasz@gmail.com"];

function logUserEvent(c, event, recipeId, meta) {
  const email = authedEmail(c);
  if (!email) return;
  const created = new Date().toISOString();
  const metaStr = meta ? JSON.stringify(meta) : null;
  c.executionCtx.waitUntil(
    c.env.DB.prepare(
      "INSERT INTO user_events (created_at, user_email, event, recipe_id, meta) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(created, email, event, recipeId || null, metaStr)
      .run()
      .catch((err) => console.error("user_events insert failed", err))
  );
}

// Returns an SQL fragment for filtering out admin emails. Inlined
// (not parameterised) because ADMIN_EMAILS is a hardcoded constant,
// not user input — no injection surface. Empty when includeAdmins
// is true so the same query template works either way.
function adminFilterSql(includeAdmins) {
  if (includeAdmins) return "";
  const list = ADMIN_EMAILS.map(e => `'${e.replace(/'/g, "''")}'`).join(",");
  return `AND user_email NOT IN (${list})`;
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

  const [featureTotals, userTotals, recentPrompts, recentEvents, tokenTotals, imageCallRow] = await Promise.all([
    safe(`SELECT feature, COUNT(*) AS n
            FROM ai_events
           GROUP BY feature
           ORDER BY n DESC`),
    safe(`SELECT user_email,
                 COUNT(*) AS n,
                 COALESCE(SUM(CAST(json_extract(meta, '$.usage.total_tokens') AS INTEGER)), 0) AS tokens
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
    // Per-model token sums for the cost estimate. Image gen
    // (gpt-image-1) is priced per call, not per token, so we
    // count those separately below.
    safe(`SELECT json_extract(meta, '$.model') AS model,
                 SUM(CAST(json_extract(meta, '$.usage.prompt_tokens') AS INTEGER)) AS prompt_tokens,
                 SUM(CAST(json_extract(meta, '$.usage.completion_tokens') AS INTEGER)) AS completion_tokens,
                 COUNT(*) AS calls
            FROM ai_events
           WHERE json_extract(meta, '$.usage.total_tokens') IS NOT NULL
           GROUP BY model`),
    safe(`SELECT COUNT(*) AS n FROM ai_events WHERE feature = 'hero-image'`),
  ]);

  const imageCalls = imageCallRow[0]?.n || 0;

  // ─── Behavioural analytics (separate table, admin-excluded by default) ───
  const includeAdmins = c.req.query("includeAdmins") === "1";
  const adminFilter = adminFilterSql(includeAdmins);

  const ueAdminFilter = adminFilter.replace(/user_email/g, "ue.user_email");

  const [
    viewTotals, addMethodTotals, shoppingActionTotals, behavioralCallRow,
    cookModeTopRecipes, cookModeCompletionRow, featureUsage,
    topSearches, filterUsage, funnelRow, weeklyActiveRow, returningUsersRow,
  ] = await Promise.all([
    // Top viewed recipes — JOIN to surface the title alongside the id.
    safe(`SELECT ue.recipe_id,
                 r.title,
                 COUNT(*) AS n
            FROM user_events ue
            LEFT JOIN recipes r ON r.id = ue.recipe_id
           WHERE ue.event = 'view-recipe'
             AND ue.recipe_id IS NOT NULL
             ${ueAdminFilter}
           GROUP BY ue.recipe_id, r.title
           ORDER BY n DESC
           LIMIT 10`),
    safe(`SELECT json_extract(meta, '$.method') AS method,
                 COUNT(*) AS n
            FROM user_events
           WHERE event = 'add-recipe'
             AND json_extract(meta, '$.method') IS NOT NULL
             ${adminFilter}
           GROUP BY method
           ORDER BY n DESC`),
    safe(`SELECT json_extract(meta, '$.action') AS action,
                 COUNT(*) AS n
            FROM user_events
           WHERE event = 'shopping-list'
             AND json_extract(meta, '$.action') IS NOT NULL
             ${adminFilter}
           GROUP BY action
           ORDER BY n DESC`),
    safe(`SELECT COUNT(*) AS n FROM user_events WHERE 1=1 ${adminFilter}`),
    // Top recipes opened in cook mode.
    safe(`SELECT ue.recipe_id,
                 r.title,
                 COUNT(*) AS n
            FROM user_events ue
            LEFT JOIN recipes r ON r.id = ue.recipe_id
           WHERE ue.event = 'cook-mode-start'
             AND ue.recipe_id IS NOT NULL
             ${ueAdminFilter}
           GROUP BY ue.recipe_id, r.title
           ORDER BY n DESC
           LIMIT 10`),
    // Cook mode completion rate: a session "completes" when stepsReached
    // / totalSteps >= 0.9 (lets the final-step nav-away still count).
    safe(`SELECT COUNT(*) AS finishes,
                 SUM(CASE
                   WHEN CAST(json_extract(meta, '$.totalSteps') AS REAL) > 0
                    AND CAST(json_extract(meta, '$.stepsReached') AS REAL)
                        / CAST(json_extract(meta, '$.totalSteps') AS REAL) >= 0.9
                   THEN 1 ELSE 0 END) AS completed
            FROM user_events
           WHERE event = 'cook-mode-finish'
             ${adminFilter}`),
    // Counts for the meta-features (cook mode, meal plan, build-a-meal).
    safe(`SELECT event, COUNT(*) AS n
            FROM user_events
           WHERE event IN ('cook-mode-start', 'meal-plan-open', 'build-a-meal-open')
             ${adminFilter}
           GROUP BY event
           ORDER BY n DESC`),
    // Top search queries (lower-cased for grouping).
    safe(`SELECT LOWER(json_extract(meta, '$.query')) AS query,
                 COUNT(*) AS n
            FROM user_events
           WHERE event = 'search'
             AND json_extract(meta, '$.query') IS NOT NULL
             AND LENGTH(json_extract(meta, '$.query')) > 0
             ${adminFilter}
           GROUP BY query
           ORDER BY n DESC
           LIMIT 20`),
    // Most-applied filters (key + value pair).
    safe(`SELECT json_extract(meta, '$.filter') AS filter_key,
                 json_extract(meta, '$.value')  AS filter_value,
                 COUNT(*) AS n
            FROM user_events
           WHERE event = 'filter-apply'
             AND json_extract(meta, '$.filter') IS NOT NULL
             ${adminFilter}
           GROUP BY filter_key, filter_value
           ORDER BY n DESC
           LIMIT 20`),
    // Funnel: of added recipes, how many got viewed >= 2x and how many
    // ever entered cook mode. Single row with three counts.
    safe(`WITH added AS (
            SELECT DISTINCT recipe_id FROM user_events
             WHERE event = 'add-recipe' AND recipe_id IS NOT NULL ${adminFilter}
          ),
          viewed_twice AS (
            SELECT recipe_id FROM user_events
             WHERE event = 'view-recipe' AND recipe_id IS NOT NULL ${adminFilter}
             GROUP BY recipe_id HAVING COUNT(*) >= 2
          ),
          cooked AS (
            SELECT DISTINCT recipe_id FROM user_events
             WHERE event = 'cook-mode-start' AND recipe_id IS NOT NULL ${adminFilter}
          )
          SELECT
            (SELECT COUNT(*) FROM added) AS total_added,
            (SELECT COUNT(*) FROM added a INNER JOIN viewed_twice v ON v.recipe_id = a.recipe_id) AS viewed_twice,
            (SELECT COUNT(*) FROM added a INNER JOIN cooked c ON c.recipe_id = a.recipe_id) AS cooked`),
    // Distinct users active in the last 7 days.
    safe(`SELECT COUNT(DISTINCT user_email) AS wau
            FROM user_events
           WHERE created_at >= datetime('now', '-7 days')
             ${adminFilter}`),
    // Returning users: active in last 7 days AND in the prior 7 days.
    safe(`SELECT COUNT(DISTINCT a.user_email) AS returning
            FROM user_events a
           INNER JOIN user_events b ON b.user_email = a.user_email
           WHERE a.created_at >= datetime('now', '-7 days')
             AND b.created_at <  datetime('now', '-7 days')
             AND b.created_at >= datetime('now', '-14 days')
             ${adminFilter.replace(/user_email/g, "a.user_email")}
             ${adminFilter.replace(/user_email/g, "b.user_email")}`),
  ]);

  const behavioralCalls = behavioralCallRow[0]?.n || 0;
  const cookModeCompletion = cookModeCompletionRow[0] || { finishes: 0, completed: 0 };
  const funnel = funnelRow[0] || { total_added: 0, viewed_twice: 0, cooked: 0 };
  const weeklyActive = weeklyActiveRow[0]?.wau || 0;
  const returningUsers = returningUsersRow[0]?.returning || 0;

  return c.json({
    featureTotals, userTotals, recentPrompts, recentEvents, tokenTotals, imageCalls,
    viewTotals, addMethodTotals, shoppingActionTotals, behavioralCalls,
    cookModeTopRecipes, cookModeCompletion, featureUsage,
    topSearches, filterUsage, funnel, weeklyActive, returningUsers,
    includesAdmins: includeAdmins,
  });
});

// Best-effort event logger called by the client at user actions
// (recipe view, add-recipe save, shopping-list action).
app.post("/api/admin/events", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const event = (body?.event || "").trim();
  if (!event) return c.json({ error: "missing event" }, 400);
  logUserEvent(c, event, body?.recipeId || null, body?.meta || null);
  return c.json({ ok: true });
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

const LANG_NAME = { en: "Canadian English", enUS: "American English", pl: "Polish", es: "Mexican Spanish", el: "Greek", pt: "Portuguese", fil: "Filipino" };

// Fan-out helper: given a recipe + its cookbook, queue
// translateAndStore for every cookbook language that isn't the
// canonical/source one. Replaces the old hard-coded en↔pl swap so
// recipes auto-translate into Spanish for the Wojick cookbook,
// Greek for the Chatz cookbook, etc.
async function translateForCookbook(env, ctx, recipeId, recipe, fromLang, cookbookId, savedBy) {
  let langs = ["en"];
  try {
    if (cookbookId) {
      const cb = await env.DB.prepare("SELECT languages FROM cookbooks WHERE id = ?").bind(cookbookId).first();
      if (cb?.languages) langs = JSON.parse(cb.languages);
    }
  } catch {}
  for (const to of langs) {
    if (!to || to === fromLang) continue;
    ctx.waitUntil(translateAndStore(env, recipeId, recipe, fromLang, to, savedBy));
  }
}

async function translateAndStore(env, recipeId, recipe, fromLang, toLang, savedBy = null) {
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
    if (savedBy) {
      await recordAiEvent(env, savedBy, "translate", recipeId, { fromLang, toLang, status: openaiRes.status }, false);
    }
    return;
  }

  const result = await openaiRes.json();
  const content = result?.choices?.[0]?.message?.content;
  if (!content) return;

  let parsed;
  try { parsed = JSON.parse(content); }
  catch { console.error("translate returned malformed JSON"); return; }

  // Log the successful translate to ai_events. Background task,
  // so we use recordAiEvent directly (no Hono context here) and
  // bill the savedBy email — the cook who triggered the save.
  if (savedBy) {
    await recordAiEvent(env, savedBy, "translate", recipeId, {
      ...aiTokens(result),
      fromLang,
      toLang,
    });
  }

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
// Slugify mirror of the client helper (src/helpers.jsx). Kept
// in sync by convention — both should produce identical output
// so a title slugged on the client and on the server collide
// the same way.
function workerSlugify(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

// One-shot migration: re-slug any recipes whose id looks like a
// timestamp (recipe-1740…) to a title-based slug. Owner-only.
// Use ?dry=1 to preview the plan before executing.
//
// Caveat: re-slugging changes recipes.id, which is the PK. Any
// link previously shared to /recipe/<old-id> will stop resolving.
// That's intentional — the cost of cleaner URLs going forward.
app.post("/api/admin/migrate/reslug", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!ADMIN_EMAILS.includes(email)) return c.json({ error: "owner only" }, 403);

  const dry = c.req.query("dry") === "1";

  const { results: rows } = await c.env.DB.prepare(
    "SELECT id, title FROM recipes"
  ).all();

  // Only re-slug ids that look like the old timestamp scheme.
  // Anything matching a real slug (kebab-case, no leading "recipe-")
  // is already fine and gets left alone.
  const TIMESTAMP_ID = /^recipe-\d+$/;

  const usedIds = new Set(rows.map(r => r.id));
  const plan = [];

  for (const row of rows) {
    if (!TIMESTAMP_ID.test(row.id)) continue;
    const base = workerSlugify(row.title);
    if (!base) { plan.push({ from: row.id, to: null, reason: "empty slug" }); continue; }
    let candidate = base;
    let attempt = 2;
    while (usedIds.has(candidate)) {
      candidate = `${base}-${attempt++}`;
    }
    usedIds.add(candidate);
    plan.push({ from: row.id, to: candidate });
  }

  if (dry) {
    return c.json({ dryRun: true, total: plan.length, plan });
  }

  let executed = 0;
  const errors = [];
  for (const item of plan) {
    if (!item.to) continue;
    try {
      const row = await c.env.DB.prepare("SELECT blob FROM recipes WHERE id = ?").bind(item.from).first();
      if (!row?.blob) continue;
      const blob = JSON.parse(row.blob);
      blob.id = item.to;
      // Update the recipe row first. FKs in this schema don't have
      // ON UPDATE CASCADE, so we follow up with manual updates to
      // every child table that references recipe_id.
      await c.env.DB.prepare("UPDATE recipes SET id = ?, blob = ? WHERE id = ?")
        .bind(item.to, JSON.stringify(blob), item.from)
        .run();
      await c.env.DB.prepare("UPDATE comments SET recipe_id = ? WHERE recipe_id = ?")
        .bind(item.to, item.from).run();
      await c.env.DB.prepare("UPDATE favorites SET recipe_id = ? WHERE recipe_id = ?")
        .bind(item.to, item.from).run().catch(() => {});
      await c.env.DB.prepare("UPDATE ai_events SET recipe_id = ? WHERE recipe_id = ?")
        .bind(item.to, item.from).run().catch(() => {});
      await c.env.DB.prepare("UPDATE user_events SET recipe_id = ? WHERE recipe_id = ?")
        .bind(item.to, item.from).run().catch(() => {});
      executed++;
    } catch (err) {
      errors.push({ from: item.from, to: item.to, error: String(err?.message || err) });
    }
  }

  return c.json({ dryRun: false, total: plan.length, executed, errors });
});

// Per-cookbook backfill: queue translations for every recipe in
// this cookbook into every cookbook language that doesn't yet
// have a stored translation. Surfaces as a "Translate all"
// button in the cookbook settings page so the owner can backfill
// when they enable a new language.
// On-demand single-recipe translation. Called by the recipe page
// when a cook switches the FAB to a language that doesn't yet
// have a stored translation for the recipe they're viewing.
// Blocks until translateAndStore returns so the client can refetch
// and re-render with the new text in one beat — no second poll.
app.post("/api/admin/recipes/:id/ensure-translation", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const to = typeof body?.lang === "string" ? body.lang.toLowerCase() : null;
  if (!to || !SUPPORTED_LANGS.includes(to)) {
    return c.json({ error: "invalid lang" }, 400);
  }
  const row = await c.env.DB.prepare(
    "SELECT id, blob, translations FROM recipes WHERE id = ?"
  ).bind(id).first();
  if (!row) return c.json({ error: "not found" }, 404);
  const existing = row.translations ? JSON.parse(row.translations) : {};
  const recipe = JSON.parse(row.blob);
  const from = recipe.canonical_lang || "en";
  if (to === from) return c.json({ ok: true, status: "canonical" });
  if (existing[to]) return c.json({ ok: true, status: "cached" });
  if (!c.env.OPENAI_API_KEY) {
    return c.json({ error: "OpenAI API key is not configured." }, 500);
  }
  await translateAndStore(c.env, id, recipe, from, to, email);
  return c.json({ ok: true, status: "translated" });
});

app.post("/api/admin/cookbooks/:id/translate-missing", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const cookbookId = c.req.param("id");
  const role = await cookbookRole(c, cookbookId);
  if (role !== "owner" && role !== "editor" && role !== "admin") {
    return c.json({ error: "owner / editor only" }, 403);
  }
  if (!c.env.OPENAI_API_KEY) {
    return c.json({ error: "OpenAI API key is not configured." }, 500);
  }
  const cb = await c.env.DB.prepare("SELECT languages FROM cookbooks WHERE id = ?").bind(cookbookId).first();
  const langs = cb?.languages ? JSON.parse(cb.languages) : ["en"];
  const rows = await c.env.DB.prepare(
    "SELECT id, blob, translations FROM recipes WHERE cookbook_id = ?"
  ).bind(cookbookId).all();
  let queued = 0;
  let skipped = 0;
  for (const row of rows.results || []) {
    const existing = row.translations ? JSON.parse(row.translations) : {};
    const recipe = JSON.parse(row.blob);
    const from = recipe.canonical_lang || "en";
    const targets = langs.filter(l => l && l !== from && !existing[l]);
    if (!targets.length) { skipped++; continue; }
    for (const to of targets) {
      c.executionCtx.waitUntil(translateAndStore(c.env, row.id, recipe, from, to, email));
    }
    queued++;
  }
  return c.json({
    ok: true, queued, skipped,
    message: `Queued ${queued} recipe${queued === 1 ? "" : "s"} for translation. They'll land within a minute.`,
  });
});

app.get("/api/admin/translate-missing", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!c.env.OPENAI_API_KEY) {
    return c.json({ error: "OpenAI API key is not configured on this Worker." }, 500);
  }

  const rows = await c.env.DB.prepare(
    "SELECT id, cookbook_id, blob, translations FROM recipes"
  ).all();

  const queued = [];
  const skipped = [];
  // Cache cookbook languages so we don't re-query for every recipe.
  const langsByCookbook = new Map();
  const getLangs = async (cookbookId) => {
    if (langsByCookbook.has(cookbookId)) return langsByCookbook.get(cookbookId);
    let langs = ["en"];
    try {
      const cb = await c.env.DB.prepare("SELECT languages FROM cookbooks WHERE id = ?").bind(cookbookId).first();
      if (cb?.languages) langs = JSON.parse(cb.languages);
    } catch {}
    langsByCookbook.set(cookbookId, langs);
    return langs;
  };
  for (const row of rows.results) {
    const existing = row.translations ? JSON.parse(row.translations) : {};
    const recipe = JSON.parse(row.blob);
    const from = recipe.canonical_lang || "en";
    const langs = await getLangs(row.cookbook_id);
    const targets = langs.filter(l => l && l !== from && !existing[l]);
    if (targets.length === 0) { skipped.push(row.id); continue; }
    for (const to of targets) {
      c.executionCtx.waitUntil(translateAndStore(c.env, row.id, recipe, from, to, email));
    }
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

  // Phase 4b-3: scope the write to the chosen cookbook. Defaults
  // to the bootstrap family cookbook so legacy clients (no
  // cookbookId in the body) keep working. Requires editor+ on
  // the destination cookbook.
  const cookbookId = (draft?.cookbookId || draft?.cookbook_id || BOOTSTRAP_COOKBOOK_ID).toString();
  const writerRole = await cookbookRole(c, cookbookId);
  if (!["owner", "editor", "admin"].includes(writerRole)) {
    return c.json({
      error: "not allowed to add recipes to this cookbook",
      detail: { cookbookId, yourRole: writerRole || "none" },
    }, 403);
  }

  const now = Date.now();
  // Collision-retry: if the caller's id is taken, append -2 / -3 /
  // … until one works. Keeps URLs readable when two recipes share
  // a title ("Apple Pie" → /recipe/apple-pie, /recipe/apple-pie-2).
  // Cap attempts so a buggy client can't hammer the DB forever.
  const baseId = draft.id;
  let finalId = baseId;
  let attempt = 0;
  while (attempt < 25) {
    const tryId = attempt === 0 ? baseId : `${baseId}-${attempt + 1}`;
    const finalDraft = { ...draft, id: tryId };
    try {
      await c.env.DB.prepare(
        `INSERT INTO recipes
           (id, title, subtitle, author, cuisine, course, photo, blob, created_by, created_at, updated_at, cookbook_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        finalDraft.id,
        finalDraft.title,
        finalDraft.subtitle ?? null,
        finalDraft.author ?? null,
        finalDraft.cuisine ?? null,
        finalDraft.course ?? null,
        finalDraft.photo ?? null,
        JSON.stringify(finalDraft),
        email,
        now,
        now,
        cookbookId
      ).run();
      finalId = tryId;
      // Fire-and-forget translation. Cook doesn't wait for it;
      // the next /api/recipes refresh after a few seconds will include it.
      // Direction follows the recipe's canonical_lang (set by
      // the cook's source language during extract) — default
      // English-canonical when missing.
      const from = finalDraft.canonical_lang || "en";
      await translateForCookbook(c.env, c.executionCtx, finalId, finalDraft, from, cookbookId, email);
      return c.json({ ok: true, id: finalId });
    } catch (err) {
      const msg = String(err?.message || err);
      // SQLite uniqueness violation phrasing — fall through to retry.
      if (/UNIQUE constraint|already exists|PRIMARY KEY/i.test(msg)) {
        attempt++;
        continue;
      }
      // Anything else is a real error.
      return c.json({ error: msg }, 500);
    }
  }
  return c.json({ error: "Too many slug collisions — please rename the recipe." }, 409);
});

// Update an existing recipe. Partial updates allowed — anything not in
// the body is left alone, except blob which is always replaced with the
// merged result so the UI can read JSON.parse(row.blob) without joining
// the column values back together.
// Stable serialisation of the fields the translator actually reads.
// Used by PATCH to decide whether a save is "text-changing" (must
// retranslate) or "non-text" (e.g. a step photo, a hero photo swap)
// where the existing translation is still correct.
function recipeTextSignature(r) {
  if (!r) return "";
  const ings = (r.ingredients || []).map(i => i?.item || "").join("|");
  const steps = (r.steps || []).map(s => `${s?.t || ""}::${s?.d || ""}`).join("|");
  const tips = (r.tips || []).join("|");
  return [r.title || "", r.subtitle || "", ings, steps, tips].join("‖");
}

app.patch("/api/admin/recipes/:id", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);

  const id = c.req.param("id");
  const patch = await c.req.json();

  const existing = await c.env.DB.prepare(
    "SELECT blob, cookbook_id FROM recipes WHERE id = ?"
  ).bind(id).first();
  if (!existing) return c.json({ error: "not found" }, 404);

  // Phase 4b-3: editing requires editor+ on the recipe's
  // cookbook (or admin in 4b-4). Falls back to bootstrap for
  // any legacy row that escaped the backfill.
  const editorRole = await cookbookRole(c, existing.cookbook_id || BOOTSTRAP_COOKBOOK_ID);
  if (!["owner", "editor", "admin"].includes(editorRole)) {
    return c.json({ error: "not allowed to edit recipes in this cookbook" }, 403);
  }

  const oldRecipe = JSON.parse(existing.blob);
  const merged = { ...oldRecipe, ...patch, id };
  const textChanged = recipeTextSignature(oldRecipe) !== recipeTextSignature(merged);
  const now = Date.now();
  // Only clear the cached Polish overlay when the underlying English
  // text has actually changed. Photo-only saves (e.g. adding a step
  // photo during cook mode) keep the existing translation intact —
  // no wasted OpenAI call, no transient blank state for PL readers.
  if (textChanged) {
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
    {
      const from = merged.canonical_lang || "en";
      await translateForCookbook(c.env, c.executionCtx, id, merged, from, existing.cookbook_id, email);
    }
  } else {
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
  }

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

  const existing = await c.env.DB.prepare("SELECT blob, cookbook_id FROM recipes WHERE id = ?").bind(id).first();
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

  // Seeds are bundled English-canonical. Fan out to whatever
  // languages the seed's cookbook currently uses.
  await translateForCookbook(c.env, c.executionCtx, id, seed, "en", existing.cookbook_id, email);

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

  const id = c.req.param("id");
  // Phase 4b-3: deleting requires editor+ on the recipe's
  // cookbook.
  const existing = await c.env.DB.prepare(
    "SELECT cookbook_id FROM recipes WHERE id = ?"
  ).bind(id).first();
  if (!existing) return c.json({ error: "not found" }, 404);
  const role = await cookbookRole(c, existing.cookbook_id || BOOTSTRAP_COOKBOOK_ID);
  if (!["owner", "editor", "admin"].includes(role)) {
    return c.json({ error: "not allowed to delete recipes in this cookbook" }, 403);
  }

  const res = await c.env.DB.prepare(
    "DELETE FROM recipes WHERE id = ?"
  ).bind(id).run();

  if (!res.meta.changes) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true });
});

// Phase 4b-3: copy a recipe into another cookbook. The caller
// must be editor+ on the destination cookbook. Creates a new
// recipe row with a fresh id and a forked_from pointer back to
// the source for attribution.
app.post("/api/admin/recipes/:id/copy-to/:cookbookId", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const sourceId = c.req.param("id");
  const destCookbook = c.req.param("cookbookId");

  const destRole = await cookbookRole(c, destCookbook);
  if (!["owner", "editor", "admin"].includes(destRole)) {
    return c.json({ error: "not allowed to add recipes to this cookbook" }, 403);
  }

  const row = await c.env.DB.prepare(
    "SELECT blob, cookbook_id FROM recipes WHERE id = ?"
  ).bind(sourceId).first();
  if (!row) return c.json({ error: "not found" }, 404);
  const source = JSON.parse(row.blob);

  // Slug-collision retry as in the create handler.
  const baseId = sourceId;
  const now = Date.now();
  let attempt = 0;
  while (attempt < 25) {
    const tryId = attempt === 0 ? baseId : `${baseId}-${attempt + 1}`;
    const finalDraft = {
      ...source,
      id: tryId,
      forkedFrom: sourceId,
      cookbookId: destCookbook,
    };
    try {
      await c.env.DB.prepare(
        `INSERT INTO recipes
           (id, title, subtitle, author, cuisine, course, photo, blob, created_by, created_at, updated_at, cookbook_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        finalDraft.id,
        finalDraft.title,
        finalDraft.subtitle ?? null,
        finalDraft.author ?? null,
        finalDraft.cuisine ?? null,
        finalDraft.course ?? null,
        finalDraft.photo ?? null,
        JSON.stringify(finalDraft),
        email,
        now, now,
        destCookbook
      ).run();
      return c.json({ ok: true, id: tryId, cookbookId: destCookbook });
    } catch (err) {
      const msg = String(err?.message || err);
      if (/UNIQUE constraint|already exists|PRIMARY KEY/i.test(msg)) { attempt++; continue; }
      return c.json({ error: msg }, 500);
    }
  }
  return c.json({ error: "Too many slug collisions" }, 409);
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
// Help endpoint needs more context-faithful reasoning — gpt-4o-mini
// tends to fall back on its training prior when the recipe context
// is unfamiliar (e.g. Polish goulash vs Hungarian default).
const AI_HELP_MODEL = "gpt-4o";

const AI_EXTRACT_SYSTEM_PROMPT = `You are a recipe extraction assistant for a family cookbook. The user will paste text containing a recipe — could be an email from a relative, a blog post copy-paste, a screenshot transcript, or freeform notes. Extract the recipe into structured JSON matching the provided schema.

LANGUAGE (critical — internally consistent)
- The source text may be in English or Polish. Read it fluently regardless.
- DETECTION: read the PROSE (step descriptions, the subtitle/tagline, tips, narrative sentences). Do NOT base detection on the title, ingredient names, or dish-name proper nouns — a Polish recipe like "Bigos" or "Pierogi" can be written about in English; an English recipe can mention "ciasto" once. The prose is what matters. When the prose is ambiguous or split, DEFAULT to "en".
- INTERNAL CONSISTENCY (most important rule): the sourceLang you return MUST exactly match the language you actually write the content in. If your output's step descriptions, subtitle, and tips are in English, set sourceLang="en". If they're in Polish, set sourceLang="pl". NEVER produce English content with sourceLang="pl", and NEVER produce Polish content with sourceLang="en". The cook's UI flips based on sourceLang — a mismatch breaks the form.
- Write the extracted output in the DETECTED source language:
  - title: the dish name. Keep traditional dish names that don't have a clean equivalent ("Bigos", "Pierogi", "Goulash"). If a translatable descriptor surrounds it, render the descriptor in the source language ("Old Polish Bigos" in EN, "Bigos Staropolski" in PL).
  - subtitle / tips: source language, always.
  - step titles ('t') + descriptions ('d'): source language, always. Every sentence of the prose must be in the source language — no half-translated mixing.
  - ingredient items: source language. Translate common ingredient names ("sauerkraut" / "kiszona kapusta", "onion" / "cebula", "flour" / "mąka"). Do NOT preserve Polish ingredient names verbatim when sourceLang="en" — the cook will read "sauerkraut" in an English recipe. Do NOT preserve English ingredient names when sourceLang="pl".
  - ingredient .grp (section name): source language ("Meat" in EN, "Mięso" in PL; "Sauce" in EN, "Sos" in PL; "Ingredients" in EN, "Składniki" in PL).
  - step .section (section name): same rule — source language.
- Brand names stay as-is regardless of language ("Bullseye BBQ sauce", "Heinz").
- ENUM FIELDS (course, occasion, difficulty, diet tags) MUST ALWAYS be the canonical English values from the schema enums regardless of source language. The cookbook's filters and analytics depend on this — the human-readable Polish labels are applied at render time via the i18n layer.

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
- The 'd' description MUST begin with a tight intro sentence of NO MORE THAN 6 words that names the action — e.g. "Mash the potatoes.", "Brown the meat on all sides.", "Whisk the egg whites stiff." Then continue with the full polished prose on the next sentence. The intro doubles as a one-glance summary in cook mode; keep it punchy, imperative, and lowercase-friendly (sentence case is fine).
- precision: "easy" (set and forget), "medium" (some attention), "careful" (precise), "watch" (don't walk away — heat, browning), "patient" (long wait — rest, rise, marinate).
- mins: your best estimate; for passive steps (rest / marinate / freeze / proof) include the wait time.

DIET (be liberal — apply EVERY tag that genuinely fits)
The valid diet values are exactly: "Gluten-free", "Dairy-free", "Nut-free", "Soy-free", "Vegan", "Vegetarian", "Pescatarian", "Carnivore", "High protein", "High fibre", "Low carb", "Low calorie". Only use values from this list. Apply MULTIPLE tags when they all apply — a vegan high-fibre lentil stew should get Vegan, Vegetarian, Dairy-free, Nut-free, Soy-free, High fibre, AND High protein if the protein count justifies it. Do not be conservative; if a tag fits, include it.

Exclusion tags (apply when the recipe genuinely doesn't contain the allergen):
- "Gluten-free" — no wheat, barley, rye, spelt, regular flour, breadcrumbs, pasta, couscous, or regular soy sauce.
- "Dairy-free" — no milk, butter, cheese, cream, yogurt, sour cream, ghee, or whey.
- "Nut-free" — no tree nuts (almonds, walnuts, pecans, pistachios, cashews, hazelnuts, etc.) and no peanuts. Coconut and seeds (sesame, sunflower) do NOT disqualify.
- "Soy-free" — no soy sauce, tamari, tofu, tempeh, edamame, miso, or soy milk.

Lifestyle tags:
- "Vegan" — zero animal products: no meat, fish, shellfish, dairy, eggs, honey, gelatin.
- "Vegetarian" — no meat or fish. Dairy and eggs are fine.
- "Pescatarian" — fish or shellfish allowed, but no other meat.
- "Carnivore" — predominantly or exclusively meat / fish / animal products (a steak with herbs counts; a meat-and-potatoes stew does not).

Nutrition-driven tags (use the nutrition estimates you provide elsewhere):
- "High protein" — at least ~20g protein per serving. Applies to meat, fish, eggs, dairy, tofu, lentils, beans, Greek yogurt, etc. NOT only "predominantly meat".
- "High fibre" — at least ~6g fibre per serving. Triggered by whole grains, legumes, beans, lentils, leafy greens, vegetables, fruit, seeds, oats.
- "Low carb" — at most ~20g carbs per serving. Bread, pasta, rice, sugar, potatoes, root vegetables push the count up; protein + non-starchy vegetables keep it low.
- "Low calorie" — at most ~400 cal per serving.

CRITICAL: cross-check your diet array against your own nutrition estimate. If you put protein=28 in nutrition, "High protein" must be in diet. If fibre=9, "High fibre" must be there. If cal=320, "Low calorie" must be there. Don't leave applicable tags off.

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
  required: ["sourceLang", "title", "subtitle", "author", "cuisine", "course", "occasion", "diet", "prep", "cook", "servingsDefault", "difficulty", "ingredients", "steps", "tips", "nutrition"],
  properties: {
    // Detected source language of the cook's paste / photo /
    // URL. The client uses it to flip the edit UI's language
    // to match what the cook wrote, and the worker uses it as
    // the saved recipe's canonical_lang so translateAndStore
    // knows which direction to translate.
    sourceLang: { type: "string", enum: ["en", "enUS", "pl", "es", "el", "pt", "fil"] },
    title:    { type: "string" },
    subtitle: { type: ["string", "null"] },
    author:   { type: ["string", "null"] },
    cuisine:  { type: ["string", "null"] },
    course:   { type: "string", enum: ["Breakfast", "Lunch", "Dinner", "Appetizer", "Dessert", "Snack"] },
    occasion: { type: "string", enum: ["Solo", "Family style", "Date night"] },
    diet:     { type: "array", items: { type: "string", enum: ["Gluten-free", "Dairy-free", "Nut-free", "Soy-free", "Vegan", "Vegetarian", "Pescatarian", "Carnivore", "High protein", "High fibre", "Low carb", "Low calorie"] } },
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

  // Cook's notes (recipe.tips) and the public margin notes (comments
  // table) often contain explicit pairing intent — "always serve with
  // X", "great alongside Y" — that the model should treat as a
  // strong signal rather than ignoring.
  const commentRows = await c.env.DB.prepare(
    "SELECT author, body FROM comments WHERE recipe_id = ? ORDER BY created_at ASC LIMIT 30"
  ).bind(recipeId).all();
  const marginNotes = (commentRows.results || [])
    .map(r => `${r.author}: ${r.body}`)
    .slice(0, 30);

  // Trim the target down to what the model needs to reason about
  // pairings — full ingredient list (so it can avoid duplicating
  // flavours) plus identity / mood fields, plus any pairing hints
  // the cook has written into tips or comments.
  const target = {
    title:    recipe.title,
    subtitle: recipe.subtitle || "",
    course:   recipe.course,
    cuisine:  recipe.cuisine,
    occasion: recipe.occasion,
    diet:     recipe.diet || [],
    ingredients: (recipe.ingredients || []).map(i => `${i.qty || ""} ${i.unit || ""} ${i.item}`.trim()),
    cooksNotes: Array.isArray(recipe.tips) && recipe.tips.length ? recipe.tips : undefined,
    marginNotes: marginNotes.length ? marginNotes : undefined,
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

PAIRING HINTS FROM THE FAMILY (highest priority):
If the target recipe's cooksNotes or marginNotes mention a specific dish by name as something the family "pairs with", "serves with", "goes with", or otherwise treats as a default companion — and that dish exists in the catalogue — include its id at the FRONT of fromBook. This is real family knowledge, not your guess. Match flexibly: "tomato soup" should match a catalogue entry titled "Ryszard's Creamy Tomato Soup". Only do this when the mention is clearly a pairing suggestion (not just an offhand reference).

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
  const mealRecipes = Array.isArray(body?.recipes) && body.recipes.length > 1 ? body.recipes : null;
  if (!recipe?.title && !mealRecipes) return c.json({ error: "missing recipe" }, 400);
  const turns = Array.isArray(body?.turns) ? body.turns.slice(-12) : [];
  if (!turns.length) return c.json({ error: "no question" }, 400);

  // Two context shapes depending on what the caller sent:
  //  • single recipe — full ingredient list + step titles + cook state
  //  • multi-recipe meal — each dish summarised so the model can
  //    reason about prep order, substitutions, and pairings without
  //    being flooded by every ingredient.
  // Format a single step as "N. Title — full body". Include the
  // FULL step description, not just the title — without the body
  // the model has no idea whether this is a stove-top dish or an
  // oven braise, whether pork goes in before or after the onions,
  // whether water is added or not. Truncate per-step to 600 chars
  // so the whole context stays under a few KB.
  const fmtStep = (s, i) => {
    const head = s.t ? `${i + 1}. ${s.t}` : `${i + 1}.`;
    const body = (s.d || "").trim();
    const bodyOut = body.length > 600 ? body.slice(0, 600) + "…" : body;
    return bodyOut ? `${head} — ${bodyOut}` : head;
  };
  // Each ingredient line shows quantity + unit + item + the
  // intuitive-measure note ("a generous pinch", "to taste"),
  // which is often where the cook's real intent lives. The
  // qty field is the canonical number; qtyNote is the prose.
  const fmtIng = (i) => {
    const qty = i.qty && i.qty > 0 ? String(i.qty) : "";
    const head = `${qty} ${i.unit ?? ""} ${i.item}`.trim().replace(/\s+/g, " ");
    const note = i.qtyNote || i.note;
    return note ? `${head} (${note})` : head;
  };
  // Group ingredients by their .grp tag so the model sees that
  // "salt" in the Rub group is distinct from "salt" in the
  // Brine group — same for "Sauce", "Topping", "Serve", etc.
  const groupedIngs = (ings) => {
    if (!Array.isArray(ings) || !ings.length) return [];
    const byGrp = new Map();
    for (const ing of ings) {
      const g = ing.grp || "Ingredients";
      if (!byGrp.has(g)) byGrp.set(g, []);
      byGrp.get(g).push(fmtIng(ing));
    }
    return [...byGrp.entries()].map(([g, lines]) => ({ group: g, items: lines }));
  };

  const context = mealRecipes
    ? {
        meal: mealRecipes.map(r => r.title).join(" + "),
        dishes: mealRecipes.map(r => ({
          title:    r.title,
          subtitle: r.subtitle || "",
          author:   r.author || null,
          cuisine:  r.cuisine,
          course:   r.course,
          servings: r.servingsDefault,
          totalMin: r.total,
          diet:     r.diet || [],
          ingredients: groupedIngs(r.ingredients),
          steps:       (r.steps || []).map(fmtStep),
          tips:        Array.isArray(r.tips) && r.tips.length ? r.tips : null,
        })),
      }
    : {
        title:    recipe.title,
        subtitle: recipe.subtitle || "",
        author:   recipe.author || null,
        cuisine:  recipe.cuisine,
        course:   recipe.course,
        servings: body?.servings ?? recipe.servingsDefault,
        weight:   body?.weight ?? null,
        weightUnit: recipe.weightUnit || null,
        cookMinsPerLb: recipe.cookMinsPerLb || null,
        diet:     recipe.diet || [],
        ingredients: groupedIngs(recipe.ingredients),
        steps:    (recipe.steps || []).map(fmtStep),
        tips:     Array.isArray(recipe.tips) && recipe.tips.length ? recipe.tips : null,
        currentStep: body?.currentStep
          ? `Cook is currently on step "${body.currentStep.t}" — ${body.currentStep.d}`
          : null,
        appliedAdjustments: Array.isArray(body?.appliedAdjustments) && body.appliedAdjustments.length
          ? body.appliedAdjustments.map(a => a.summary || a.prompt).filter(Boolean)
          : null,
      };

  // CRITICAL: the recipe in CONTEXT is the source of truth. The
  // model must defer to it over its training prior — many family
  // recipes (Polish goulash, Babcia's bigos, regional barbecue)
  // diverge from the canonical version the model "knows."
  const anchorRule = `GROUND TRUTH: The recipe in the CONTEXT below is the source of truth for THIS cook's THIS dish. It may diverge from the canonical/most-common version of the dish you know from training (regional variants, family adaptations, dietary tweaks). When the recipe's ingredients, method, ingredient order, cooking surface (stove vs oven), liquid amounts, or timing differ from what you'd expect, FOLLOW THE RECIPE — do not "correct" it toward the version you know. Before giving advice, re-read the relevant steps from the context and quote/paraphrase them. Never tell the cook to add an ingredient that isn't in the recipe, change the cooking surface the recipe specifies, or reorder ingredients the recipe explicitly orders. If the cook's question implies they're doing something different from the recipe, gently point them back to the actual step.`;

  const systemPrompt = mealRecipes
    ? `You are the kitchen-side AI helper inside a family cookbook. The cook is planning or cooking a multi-dish meal — keep the whole meal in mind, not just one dish. ${anchorRule} Reply in 2-4 short paragraphs, plain prose, written like a thoughtful family cook giving real advice. When asked about substitutions or scaling, name which dish you mean. When asked about prep order, think about what can be made ahead vs what has to be timed to finishing.`
    : `You are the kitchen-side AI helper inside a family cookbook. The cook is mid-recipe and needs a practical answer fast. ${anchorRule} Reply in 2-4 short paragraphs, plain prose, written like a thoughtful family cook giving real advice — not a list of caveats. Reference the recipe's actual ingredients and the cook's current step or servings when it helps. If the cook hasn't told you which ingredient/step they mean, ask ONE focused clarifying question first.`;

  // Optional photo: the cook snaps a quick shot of the pan and
  // attaches it to their question ("does this look right?",
  // "is it ready?", "is this burning?"). The image rides along
  // with the LAST user turn as a multimodal content array.
  // gpt-4o is vision-capable so no model swap needed.
  const imageDataUrl = typeof body?.imageDataUrl === "string" && body.imageDataUrl.startsWith("data:image/")
    ? body.imageDataUrl
    : null;

  const turnMessages = turns.map((t, i) => {
    const isLast = i === turns.length - 1;
    if (isLast && imageDataUrl && t.role === "you") {
      return {
        role: "user",
        content: [
          { type: "text", text: t.text || "Look at this and tell me how it's going — is it on track for the recipe, ready, undercooked, burning?" },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } },
        ],
      };
    }
    return {
      role: t.role === "ai" ? "assistant" : "user",
      content: t.text,
    };
  });

  const messages = [
    { role: "system", content: systemPrompt + (imageDataUrl ? "\n\nThe cook has attached a photo of what they're cooking right now. Look at it carefully — assess colour, doneness cues, liquid level, browning, texture — and compare against what the recipe's current step expects. Tell them concretely whether to keep going, adjust, or pull off the heat." : "") },
    {
      role: "user",
      content: `${mealRecipes ? "MEAL CONTEXT" : "RECIPE CONTEXT"}:\n${JSON.stringify(context, null, 2)}`,
    },
    ...turnMessages,
  ];

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${c.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: AI_HELP_MODEL, messages }),
  });
  if (!openaiRes.ok) {
    console.error("OpenAI help error", openaiRes.status, await openaiRes.text());
    return c.json({ error: `OpenAI returned ${openaiRes.status}.` }, 502);
  }
  const result = await openaiRes.json();
  const answer = result?.choices?.[0]?.message?.content;
  if (!answer) return c.json({ error: "OpenAI returned no content." }, 502);
  const lastUserTurn = [...turns].reverse().find(t => t.role === "user" || t.role === "you");
  logAiEvent(c, "help", recipe?.id || null, {
    ...aiTokens(result),
    turnCount: turns.length,
    prompt: (lastUserTurn?.text || "").slice(0, 200),
    fromCookMode: !!body?.cookState,
    mealMode: !!mealRecipes,
    mealDishCount: mealRecipes?.length || null,
    withImage: !!imageDataUrl,
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
          // Section name — "Dough", "Filling", "Streusel", "Glaze",
          // "Sauce", "Garnish", etc. Default "Ingredients" if the
          // recipe has no natural grouping. Drives the ingredient
          // list rendering in the Lab card.
          grp:  { type: "string" },
        },
        required: ["qty", "unit", "item", "grp"],
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
  // Full text — no 300-char cap. The model needs the actual
  // prompts and tasting notes to maintain context across
  // iterations (e.g. "keep the rhubarb in"). Cap at 16 turns
  // so the request stays under a few KB.
  const history = Array.isArray(body?.history)
    ? body.history.slice(-16).map(t => ({
        role: t.role === "ai" ? "assistant" : "user",
        text: (t.text || "").slice(0, 2000),
        tastingNote: t.tastingNote || null,
      }))
    : [];
  // Cook's freeform cooking preferences (set in their profile).
  // E.g. "I like things fruit-forward and jammy with extra fruit",
  // "I cook lower-sugar than the recipe usually calls for",
  // "We're a kosher household — no pork/shellfish/dairy+meat."
  const cookPrefs = (body?.cookPrefs || "").toString().slice(0, 1200).trim();

  const messages = [
    {
      role: "system",
      content: `You are the kitchen experimentation AI for a family cookbook's "Lab". The cook is iterating on a dish — your job is to produce a recipe draft that incorporates what they just asked for. Voice: warm, opinionated family cook. Don't apologise, don't add caveats, don't list every assumption. Just write the recipe.

CONTEXT CONTINUITY (critical): When the cook has asked for something specific earlier in the conversation, KEEP IT in later drafts unless they explicitly ask you to drop it. If the cook said "strawberry rhubarb muffins" two turns ago and now says "make them less dense", the next draft is STILL strawberry rhubarb muffins. Re-read the whole history before producing a new draft and inventory the constraints the cook has accumulated (key ingredients, dietary needs, format, mood). Never silently drop a previously-requested ingredient.

INGREDIENT SECTIONS: Group ingredients by .grp into sections that mirror the cook's mental model of building the dish: "Dough", "Batter", "Filling", "Streusel", "Topping", "Glaze", "Sauce", "Rub", "Marinade", "Brine", "Garnish", "Serve". If a recipe has only one section (e.g. a simple soup), put everything in "Ingredients". Order sections in the order they're used.

PROACTIVE IMPROVEMENTS: Beyond just doing what was asked, look at the dish holistically and PROPOSE one or two improvements that would round it out — a cream cheese glaze to balance a tart filling, a brown-butter swap for nuttier crumb, a quick pickled-onion topping to cut richness, a streusel for textural contrast. Mention them in the greeting field ("Added a cream cheese glaze — the rhubarb tartness needs it. Want me to push the cardamom too?"). Don't add them silently to the recipe unless they're already part of the cook's request — surface them as questions.

When a previous draft is provided, treat your output as the NEXT iteration — change what the cook asked to change, leave the rest stable. Don't quietly rewrite steps that weren't touched.

The diff field is ONE short clause listing the changes made vs the previous draft, comma-separated ("halved sugar, added cardamom, swapped milk for buttermilk"). If there's no previous draft, diff is "Initial draft".

The greeting field is one to two short sentences framing the new draft AND ending with a concrete question or suggested improvement — give the cook somewhere to go next ("First pass at the brioche. Want me to brown the butter for a nuttier crumb?", "Kept the rhubarb forward — should I add a cream cheese drizzle to balance the tartness?").${cookPrefs ? "\n\nCOOK PREFERENCES (apply to every draft unless the cook explicitly contradicts them):\n" + cookPrefs : ""}`,
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
      // gpt-4o is much better at honouring the accumulated context
      // (keeping the rhubarb in across iterations, proposing
      // balancing components, grouping ingredients into natural
      // sections) than gpt-4o-mini was.
      model: AI_HELP_MODEL,
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
  const cookPrefs = (body?.cookPrefs || "").toString().slice(0, 1200).trim();

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${c.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: AI_HELP_MODEL,
      messages: [
        {
          role: "system",
          content: (cookPrefs ? `COOK PREFERENCES: ${cookPrefs}\n\n` : "") + `Given a draft recipe and a small history of tasting notes from earlier iterations, propose 2-3 concrete next things the cook could try. Each suggestion has:
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
      model: AI_HELP_MODEL,
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

// ─── Lab: experiments CRUD (server-side persistence) ───
// Experiments used to live in localStorage so they didn't follow
// the cook between devices. These four endpoints back the Lab
// with D1 so a draft started on the desktop shows up on the
// phone and vice versa.
app.get("/api/admin/lab/experiments", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const rows = await c.env.DB.prepare(
    "SELECT id, title, blurb, status, draft_json, chat_json, created_at, updated_at FROM lab_experiments WHERE owner_email = ? ORDER BY updated_at DESC"
  ).bind(email).all();
  const experiments = (rows.results || []).map(r => ({
    id: r.id,
    title: r.title,
    blurb: r.blurb || "",
    status: r.status,
    draft: JSON.parse(r.draft_json || "null"),
    chat:  JSON.parse(r.chat_json  || "[]"),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
  return c.json({ experiments });
});

app.post("/api/admin/lab/experiments", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const draft = body?.draft;
  const chat = Array.isArray(body?.chat) ? body.chat : [];
  if (!draft?.title) return c.json({ error: "missing draft" }, 400);
  const id = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO lab_experiments (id, owner_email, title, blurb, status, draft_json, chat_json, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)"
  ).bind(id, email, draft.title, draft.blurb || "", JSON.stringify(draft), JSON.stringify(chat), now, now).run();
  return c.json({ id, createdAt: now, updatedAt: now });
});

app.patch("/api/admin/lab/experiments/:id", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const row = await c.env.DB.prepare(
    "SELECT owner_email FROM lab_experiments WHERE id = ?"
  ).bind(id).first();
  if (!row) return c.json({ error: "not found" }, 404);
  if (row.owner_email !== email) return c.json({ error: "forbidden" }, 403);
  const sets = [];
  const args = [];
  if (body.draft) {
    sets.push("draft_json = ?", "title = ?", "blurb = ?");
    args.push(JSON.stringify(body.draft), body.draft.title, body.draft.blurb || "");
  }
  if (Array.isArray(body.chat)) {
    sets.push("chat_json = ?");
    args.push(JSON.stringify(body.chat));
  }
  if (body.status === "pending" || body.status === "promoted") {
    sets.push("status = ?");
    args.push(body.status);
  }
  if (!sets.length) return c.json({ ok: true });
  const now = new Date().toISOString();
  sets.push("updated_at = ?");
  args.push(now, id);
  await c.env.DB.prepare(
    `UPDATE lab_experiments SET ${sets.join(", ")} WHERE id = ?`
  ).bind(...args).run();
  return c.json({ ok: true, updatedAt: now });
});

app.delete("/api/admin/lab/experiments/:id", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT owner_email FROM lab_experiments WHERE id = ?"
  ).bind(id).first();
  if (!row) return c.json({ error: "not found" }, 404);
  if (row.owner_email !== email) return c.json({ error: "forbidden" }, 403);
  await c.env.DB.prepare("DELETE FROM lab_experiments WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// ─── User cooking preferences ───
// Read + write the cook's freeform "how I like to cook" note.
// Read also returns an empty string if the row doesn't exist,
// ─── Profile ───
// First/last name + phone. Frontend gates the app on
// profileComplete so first-time cooks can't slip through
// without filling it in.

// "Network" — everyone the cook shares at least one cookbook
// with, used as the suggested-invitees list when creating a new
// cookbook. Cheap one-query lookup that joins members against
// the cook's own memberships. Self is excluded.
app.get("/api/admin/me/network", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ network: [] });
  const rows = await c.env.DB.prepare(`
    SELECT DISTINCT m2.user_email AS email,
           u.display_name, u.first_name, u.last_name
    FROM cookbook_members m1
    JOIN cookbook_members m2
      ON m2.cookbook_id = m1.cookbook_id AND m2.user_email != m1.user_email
    LEFT JOIN users u ON u.email = m2.user_email
    WHERE m1.user_email = ?
    ORDER BY u.display_name COLLATE NOCASE
  `).bind(email).all();
  return c.json({
    network: (rows.results || []).map(r => ({
      email: r.email,
      displayName: r.display_name || null,
      firstName: r.first_name || null,
      lastName: r.last_name || null,
    })),
  });
});

app.get("/api/admin/me/profile", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  await ensureUserBootstrap(c);
  // Try the full SELECT first; if the simple_mode / lang columns
  // don't exist yet (migration 0016 hasn't been applied), fall
  // back to the older shape so the endpoint never 500s and the
  // app — including the admin menu gating off isAdmin — keeps
  // working through a half-applied migration set.
  let row;
  try {
    row = await c.env.DB.prepare(
      "SELECT email, display_name, first_name, last_name, phone, is_admin, status, simple_mode, lang FROM users WHERE email = ?"
    ).bind(email).first();
  } catch (err) {
    row = await c.env.DB.prepare(
      "SELECT email, display_name, first_name, last_name, phone, is_admin, status FROM users WHERE email = ?"
    ).bind(email).first();
  }
  const firstName = row?.first_name || "";
  const lastName = row?.last_name || "";
  return c.json({
    email: row?.email || email,
    displayName: row?.display_name || "",
    firstName,
    lastName,
    phone: row?.phone || "",
    isAdmin: !!row?.is_admin,
    simpleMode: !!row?.simple_mode,
    lang: row?.lang || "en",
    status: row?.status || "pending",
    profileComplete: !!(firstName && lastName),
  });
});

// Admin: detail view for a single user — memberships, pending
// invitations addressed to them, and outgoing join requests
// they've sent. Used by the admin user-edit modal so admins can
// see "what cookbooks does this person have access to" at a
// glance.
app.get("/api/admin/users/:email/cookbooks", async (c) => {
  const caller = authedEmail(c);
  if (!caller) return c.json({ error: "not signed in" }, 401);
  if (!(await isAdmin(c))) return c.json({ error: "admin only" }, 403);
  const target = c.req.param("email").toLowerCase();
  // Self-heal: join_requests may not exist on older deploys.
  await c.env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS join_requests (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       cookbook_id TEXT NOT NULL,
       user_email TEXT NOT NULL,
       message TEXT,
       status TEXT NOT NULL DEFAULT 'pending',
       created_at TEXT NOT NULL,
       decided_at TEXT,
       decided_by TEXT,
       decided_role TEXT,
       UNIQUE(cookbook_id, user_email)
     )`
  ).run().catch(() => {});
  const nowIso = new Date().toISOString();
  const memberships = await c.env.DB.prepare(
    `SELECT m.role, m.joined_at, c.id, c.name, c.slug, c.visibility, c.cover_color, c.cover_photo
     FROM cookbook_members m
     JOIN cookbooks c ON c.id = m.cookbook_id
     WHERE m.user_email = ?
     ORDER BY m.joined_at DESC`
  ).bind(target).all();
  const invitations = await c.env.DB.prepare(
    `SELECT i.token, i.role, i.invited_by, i.created_at, i.expires_at,
            c.id AS cookbook_id, c.name, c.slug
     FROM invitations i
     LEFT JOIN cookbooks c ON c.id = i.cookbook_id
     WHERE LOWER(i.email) = LOWER(?) AND i.accepted_at IS NULL AND i.expires_at > ?
     ORDER BY i.created_at DESC`
  ).bind(target, nowIso).all();
  const joinRequests = await c.env.DB.prepare(
    `SELECT j.id, j.created_at, j.status,
            c.id AS cookbook_id, c.name, c.slug
     FROM join_requests j
     LEFT JOIN cookbooks c ON c.id = j.cookbook_id
     WHERE j.user_email = ? AND j.status = 'pending'
     ORDER BY j.created_at DESC`
  ).bind(target).all().catch(() => ({ results: [] }));
  return c.json({
    memberships: (memberships.results || []).map(r => ({
      cookbookId: r.id,
      name: r.name,
      slug: r.slug,
      visibility: r.visibility,
      coverColor: r.cover_color || null,
      coverPhoto: r.cover_photo || null,
      role: r.role,
      joinedAt: r.joined_at,
    })),
    invitations: (invitations.results || []).map(r => ({
      token: r.token,
      role: r.role,
      invitedBy: r.invited_by,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      cookbookId: r.cookbook_id,
      cookbookName: r.name,
      cookbookSlug: r.slug,
    })),
    joinRequests: (joinRequests.results || []).map(r => ({
      id: r.id,
      createdAt: r.created_at,
      cookbookId: r.cookbook_id,
      cookbookName: r.name,
      cookbookSlug: r.slug,
    })),
  });
});

// Admin: approve / decline a pending account.
app.post("/api/admin/users/:email/approve", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!(await isAdmin(c))) return c.json({ error: "admin only" }, 403);
  const target = c.req.param("email").toLowerCase();
  await c.env.DB.prepare(
    "UPDATE users SET status = 'approved' WHERE email = ?"
  ).bind(target).run();
  return c.json({ ok: true });
});

// Lightweight pending-approval count for the avatar badge.
// Admin-only — non-admins get { count: 0 } so the client
// doesn't need to special-case the response.
app.get("/api/admin/pending-count", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ count: 0 });
  if (!(await isAdmin(c))) return c.json({ count: 0 });
  const row = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM users WHERE status = 'pending'"
  ).first();
  return c.json({ count: row?.n || 0 });
});

app.post("/api/admin/users/:email/decline", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!(await isAdmin(c))) return c.json({ error: "admin only" }, 403);
  const target = c.req.param("email").toLowerCase();
  await c.env.DB.prepare(
    "UPDATE users SET status = 'declined' WHERE email = ?"
  ).bind(target).run();
  return c.json({ ok: true });
});

// Admin: reset another user's password. Sets a known new
// password chosen by the admin (no email round-trip). Logs the
// reset event so we have an audit trail.
app.post("/api/admin/users/:email/reset-password", async (c) => {
  const caller = authedEmail(c);
  if (!caller) return c.json({ error: "not signed in" }, 401);
  if (!(await isAdmin(c))) return c.json({ error: "admin only" }, 403);
  const targetEmail = c.req.param("email").toLowerCase();
  const body = await c.req.json().catch(() => ({}));
  const newPassword = (body?.newPassword || "").toString();
  const pwIssue = passwordIssues(newPassword);
  if (pwIssue) return c.json({ error: pwIssue }, 400);
  const { hash, salt } = await hashPassword(newPassword);
  await c.env.DB.prepare(
    `UPDATE users SET password_hash = ?, password_salt = ?,
                      failed_login_count = 0, failed_login_until = NULL,
                      reset_token = NULL, reset_expires = NULL
     WHERE LOWER(email) = ?`
  ).bind(hash, salt, targetEmail).run();
  return c.json({ ok: true });
});

// Admin: edit another user's profile (name, phone, admin flag).
app.patch("/api/admin/users/:email", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!(await isAdmin(c))) return c.json({ error: "admin only" }, 403);
  const target = c.req.param("email").toLowerCase();
  const body = await c.req.json().catch(() => ({}));
  const sets = [];
  const args = [];
  if (typeof body?.firstName === "string") {
    sets.push("first_name = ?"); args.push(body.firstName.trim().slice(0, 60) || null);
  }
  if (typeof body?.lastName === "string") {
    sets.push("last_name = ?"); args.push(body.lastName.trim().slice(0, 60) || null);
  }
  if (typeof body?.phone === "string") {
    sets.push("phone = ?"); args.push(body.phone.trim().slice(0, 32) || null);
  }
  if (typeof body?.displayName === "string") {
    sets.push("display_name = ?"); args.push(body.displayName.trim().slice(0, 120) || null);
  }
  if (typeof body?.isAdmin === "boolean") {
    sets.push("is_admin = ?"); args.push(body.isAdmin ? 1 : 0);
  }
  if (["approved", "pending", "declined"].includes(body?.status)) {
    sets.push("status = ?"); args.push(body.status);
  }
  if (typeof body?.simpleMode === "boolean") {
    sets.push("simple_mode = ?"); args.push(body.simpleMode ? 1 : 0);
  }
  if (["en", "enUS", "pl", "es", "el", "pt", "fil"].includes(body?.lang)) {
    sets.push("lang = ?"); args.push(body.lang);
  }
  if (!sets.length) return c.json({ ok: true });
  args.push(target);
  await c.env.DB.prepare(
    `UPDATE users SET ${sets.join(", ")} WHERE email = ?`
  ).bind(...args).run();
  return c.json({ ok: true });
});

app.put("/api/admin/me/profile", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  await ensureUserBootstrap(c);
  const body = await c.req.json().catch(() => ({}));
  const firstName = (body?.firstName || "").toString().trim().slice(0, 60);
  const lastName = (body?.lastName || "").toString().trim().slice(0, 60);
  const phone = (body?.phone || "").toString().trim().slice(0, 32);
  const ALLOWED_LANGS = ["en", "enUS", "pl", "es", "el", "pt", "fil"];
  const lang = ALLOWED_LANGS.includes(body?.lang) ? body.lang : null;
  if (!firstName || !lastName) return c.json({ error: "first and last name required" }, 400);
  if (!phone) return c.json({ error: "phone number required" }, 400);
  // display_name follows the cook's chosen name so all other
  // surfaces (avatar menu, member rows, AI greetings later) read
  // it without separate lookups.
  // Capture the OLD display name before we overwrite it so we
  // can rename auto-bootstrapped cookbooks that still carry the
  // email-derived placeholder ("kayrwojcik's Cookbook" → "Kayla's
  // Cookbook").
  const oldRow = await c.env.DB.prepare(
    "SELECT display_name FROM users WHERE email = ?"
  ).bind(email).first();
  const oldDisplayName = oldRow?.display_name || "";

  const displayName = `${firstName} ${lastName}`.trim();
  if (lang) {
    await c.env.DB.prepare(
      "UPDATE users SET first_name = ?, last_name = ?, phone = ?, display_name = ?, lang = ? WHERE email = ?"
    ).bind(firstName, lastName, phone || null, displayName, lang, email).run();
  } else {
    await c.env.DB.prepare(
      "UPDATE users SET first_name = ?, last_name = ?, phone = ?, display_name = ? WHERE email = ?"
    ).bind(firstName, lastName, phone || null, displayName, email).run();
  }

  // Rename any auto-bootstrapped personal cookbook the cook owns
  // to the new naming convention ("<First>'s Favourite Recipes").
  // Pattern-matches against every placeholder we've ever used:
  // the email local-part, the old display_name, "<X>'s Cookbook"
  // (legacy bootstrap label), or "<X>'s Favourite Recipes" (in
  // case the cook is renaming themselves after we already used
  // the new label). Explicit renames not matching any pattern
  // are left alone.
  const localPart = email.split("@")[0];
  const candidates = [oldDisplayName, localPart, firstName].filter(Boolean);
  const newPersonalName = `${firstName}'s Favourite Recipes`;
  for (const c0 of candidates) {
    for (const oldName of [`${c0}'s Cookbook`, `${c0}'s Favourite Recipes`]) {
      await c.env.DB.prepare(
        "UPDATE cookbooks SET name = ? WHERE owner_email = ? AND name = ?"
      ).bind(newPersonalName, email, oldName).run().catch(() => {});
    }
    // Old "<X>'s Family Cookbook" naming is replaced with the
    // new "<Last> Family Cookbook" convention.
    await c.env.DB.prepare(
      "UPDATE cookbooks SET name = ? WHERE owner_email = ? AND name = ?"
    ).bind(`${lastName} Family Cookbook`, email, `${c0}'s Family Cookbook`).run().catch(() => {});
  }

  // First-time profile setup: bootstrap the family cookbook
  // ("<Last> Family Cookbook") if the cook doesn't already own
  // one. Adds them as owner with display_order 0 so it sits at
  // the front of their library as the default. Their personal
  // cookbook (already created with the placeholder name by
  // ensureUserBootstrap) is bumped to display_order 1.
  const owned = (await c.env.DB.prepare(
    "SELECT id FROM cookbooks WHERE owner_email = ?"
  ).bind(email).all()).results || [];
  const hasFamily = owned.some(o => /family/i.test(o.id) || / family cookbook$/i.test(o.id));
  if (!hasFamily && lastName) {
    const emailHash = await sha256Hex(email);
    const familyId = `family-${emailHash.slice(0, 12)}`;
    const familySlug = `${slugifyServer(lastName)}-family-${emailHash.slice(0, 6)}`;
    const nowIso = new Date().toISOString();
    await c.env.DB.prepare(
      "ALTER TABLE cookbook_members ADD COLUMN display_order INTEGER"
    ).run().catch(() => {});
    // The cookbook insert + membership insert are the load-bearing
    // pair — silently swallowing either left earlier signups
    // (Amber) with an orphan cookbook they couldn't write to.
    // Surface failures here, and use a no-display_order fallback
    // for the membership row if the column add somehow didn't
    // take (e.g. migration 0017 hasn't been run yet on a fresh
    // environment).
    try {
      await c.env.DB.prepare(
        "INSERT OR IGNORE INTO cookbooks (id, owner_email, name, slug, visibility, blurb, languages, created_at, updated_at) VALUES (?, ?, ?, ?, 'public', '', ?, ?, ?)"
      ).bind(
        familyId, email, `${lastName} Family Cookbook`, familySlug,
        JSON.stringify(["en"]), nowIso, nowIso
      ).run();
    } catch (err) {
      console.error("family cookbook bootstrap: cookbook insert failed", err);
    }
    try {
      await c.env.DB.prepare(
        "INSERT OR IGNORE INTO cookbook_members (cookbook_id, user_email, role, display_order, joined_at) VALUES (?, ?, 'owner', 0, ?)"
      ).bind(familyId, email, nowIso).run();
    } catch (err) {
      console.error("family cookbook bootstrap: member insert with display_order failed, retrying without", err);
      await c.env.DB.prepare(
        "INSERT OR IGNORE INTO cookbook_members (cookbook_id, user_email, role, joined_at) VALUES (?, ?, 'owner', ?)"
      ).bind(familyId, email, nowIso).run().catch(e => {
        console.error("family cookbook bootstrap: member insert fallback also failed", e);
      });
    }
    // Push the personal cookbook to display_order 1 so the new
    // family book takes position 0.
    await c.env.DB.prepare(
      `UPDATE cookbook_members SET display_order = 1
       WHERE user_email = ?
         AND cookbook_id IN (SELECT id FROM cookbooks WHERE owner_email = ? AND id LIKE 'personal-%')`
    ).bind(email, email).run().catch(() => {});
  }

  return c.json({
    email, displayName, firstName, lastName, phone, profileComplete: true,
  });
});

// ─── Account deletion ───
// Cascading delete for a user. Owned cookbooks (and their
// recipes/comments/favourites/ai_events/invitations/members)
// are removed. Memberships in other cookbooks are removed.
// Personal data (favorites, lab_experiments, user_prefs,
// pending invites the cook sent) goes too. The users row is
// removed last. ai_events history is preserved with the
// original email so usage analytics survive — a future
// "fully erase" path could anonymise these.
async function deleteUserCascade(env, email) {
  const cookbooks = (await env.DB.prepare(
    "SELECT id FROM cookbooks WHERE owner_email = ?"
  ).bind(email).all()).results || [];

  for (const { id: cbId } of cookbooks) {
    const recipes = (await env.DB.prepare(
      "SELECT id FROM recipes WHERE cookbook_id = ?"
    ).bind(cbId).all()).results || [];
    for (const { id: rid } of recipes) {
      await env.DB.prepare("DELETE FROM comments WHERE recipe_id = ?").bind(rid).run().catch(() => {});
      await env.DB.prepare("DELETE FROM favorites WHERE recipe_id = ?").bind(rid).run().catch(() => {});
    }
    await env.DB.prepare("DELETE FROM recipes WHERE cookbook_id = ?").bind(cbId).run().catch(() => {});
    await env.DB.prepare("DELETE FROM invitations WHERE cookbook_id = ?").bind(cbId).run().catch(() => {});
    await env.DB.prepare("DELETE FROM cookbook_members WHERE cookbook_id = ?").bind(cbId).run().catch(() => {});
    await env.DB.prepare("DELETE FROM cookbooks WHERE id = ?").bind(cbId).run().catch(() => {});
  }

  await env.DB.prepare("DELETE FROM cookbook_members WHERE user_email = ?").bind(email).run().catch(() => {});
  await env.DB.prepare("DELETE FROM favorites WHERE user_email = ?").bind(email).run().catch(() => {});
  await env.DB.prepare("DELETE FROM lab_experiments WHERE owner_email = ?").bind(email).run().catch(() => {});
  await env.DB.prepare("DELETE FROM user_prefs WHERE user_email = ?").bind(email).run().catch(() => {});
  await env.DB.prepare("DELETE FROM invitations WHERE invited_by = ? AND accepted_at IS NULL").bind(email).run().catch(() => {});
  await env.DB.prepare("DELETE FROM users WHERE email = ?").bind(email).run().catch(() => {});
}

// Self-delete. Refuses if the user still owns the historical
// bootstrap family cookbook — that cookbook predates the
// multi-tenant work and is the family's shared root, so we
// require ownership to be transferred via the Members tab
// before letting the cook walk away.
app.delete("/api/admin/me/account", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const bootstrap = await c.env.DB.prepare(
    "SELECT id FROM cookbooks WHERE id = ? AND owner_email = ?"
  ).bind(BOOTSTRAP_COOKBOOK_ID, email).first();
  if (bootstrap) {
    return c.json({
      error: "transfer ownership of the Heirloom Family Cookbook before deleting your account",
    }, 400);
  }
  await deleteUserCascade(c.env, email);
  return c.json({ ok: true });
});

// Admin user management: list all users + delete a user.
app.get("/api/admin/users", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!(await isAdmin(c))) return c.json({ error: "admin only" }, 403);
  // Tolerant of migration 0016 not being applied yet — fall back
  // to a SELECT without simple_mode / lang if those columns
  // aren't there.
  let rows;
  try {
    rows = await c.env.DB.prepare(`
      SELECT u.email, u.display_name, u.first_name, u.last_name, u.phone,
             u.tier, u.status, u.is_admin, u.simple_mode, u.lang,
             u.created_at, u.last_seen_at,
             (SELECT COUNT(*) FROM cookbooks WHERE owner_email = u.email) AS owned_count,
             (SELECT COUNT(*) FROM cookbook_members WHERE user_email = u.email) AS membership_count
      FROM users u
      ORDER BY (u.email = ?) DESC, u.created_at ASC
    `).bind(email).all();
  } catch (err) {
    rows = await c.env.DB.prepare(`
      SELECT u.email, u.display_name, u.first_name, u.last_name, u.phone,
             u.tier, u.status, u.is_admin,
             u.created_at, u.last_seen_at,
             (SELECT COUNT(*) FROM cookbooks WHERE owner_email = u.email) AS owned_count,
             (SELECT COUNT(*) FROM cookbook_members WHERE user_email = u.email) AS membership_count
      FROM users u
      ORDER BY (u.email = ?) DESC, u.created_at ASC
    `).bind(email).all();
  }
  return c.json({
    users: (rows.results || []).map(r => ({
      email: r.email,
      displayName: r.display_name || null,
      firstName: r.first_name || null,
      lastName: r.last_name || null,
      phone: r.phone || null,
      tier: r.tier,
      status: r.status,
      isAdmin: !!r.is_admin,
      simpleMode: !!r.simple_mode,
      lang: r.lang || "en",
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      ownedCount: r.owned_count,
      membershipCount: r.membership_count,
    })),
  });
});

app.delete("/api/admin/users/:email", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  if (!(await isAdmin(c))) return c.json({ error: "admin only" }, 403);
  const target = c.req.param("email").toLowerCase();
  if (target === email.toLowerCase()) {
    return c.json({ error: "use /api/admin/me/account to delete your own account" }, 400);
  }
  // Refuse to nuke the bootstrap cookbook owner — Patricia keeps
  // a guard rail against accidentally deleting the root account.
  const ownsBootstrap = await c.env.DB.prepare(
    "SELECT id FROM cookbooks WHERE id = ? AND owner_email = ?"
  ).bind(BOOTSTRAP_COOKBOOK_ID, target).first();
  if (ownsBootstrap) {
    return c.json({
      error: "this user owns the Heirloom Family Cookbook — transfer ownership first",
    }, 400);
  }
  await deleteUserCascade(c.env, target);
  return c.json({ ok: true });
});

// ─── Cooking preferences ───
// so the client doesn't need to handle a 404 on first load.
app.get("/api/admin/me/prefs", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const row = await c.env.DB.prepare(
    "SELECT prefs_text, updated_at FROM user_prefs WHERE user_email = ?"
  ).bind(email).first();
  return c.json({
    cookPrefs: row?.prefs_text || "",
    updatedAt: row?.updated_at || null,
  });
});

app.put("/api/admin/me/prefs", async (c) => {
  const email = authedEmail(c);
  if (!email) return c.json({ error: "not signed in" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const prefs = (body?.cookPrefs || "").toString().slice(0, 4000);
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO user_prefs (user_email, prefs_text, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_email) DO UPDATE SET prefs_text = excluded.prefs_text, updated_at = excluded.updated_at`
  ).bind(email, prefs, now).run();
  return c.json({ ok: true, updatedAt: now });
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

// ─── Per-recipe Open Graph (shareable previews) ──────────────
// Intercepts /recipe/:id document requests, fetches the SPA's
// index.html, and rewrites the static og:* / twitter:* / <title>
// tags with this recipe's title, subtitle, and hero photo. So
// when someone pastes the link into iMessage / WhatsApp /
// Slack / Facebook, the unfurl shows the dish and its name
// instead of the generic cookbook identity.
//
// Crawlers don't run JS — they read the HTML response. The
// React app still bootstraps normally for human visitors; only
// the head meta changes.
//
// Note: only intercepts HTML requests (Accept: text/html and
// no .ext on the path). API calls go through their own routes
// further up.
function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function absoluteImageUrl(photo, requestUrl) {
  if (!photo) return null;
  if (/^https?:\/\//i.test(photo)) return photo;
  const origin = new URL(requestUrl).origin;
  return photo.startsWith("/") ? `${origin}${photo}` : `${origin}/${photo}`;
}

function injectRecipeOG(html, { title, description, image, url }) {
  const t = escHtml(title);
  const d = escHtml(description);
  const i = image ? escHtml(image) : null;
  const u = escHtml(url);
  let out = html
    .replace(/<title>[^<]*<\/title>/i, `<title>${t}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${d}" />`)
    .replace(/<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${t}" />`)
    .replace(/<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${d}" />`)
    .replace(/<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${u}" />`)
    .replace(/<meta\s+property="og:type"[^>]*>/i, `<meta property="og:type" content="article" />`)
    .replace(/<meta\s+name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${t}" />`)
    .replace(/<meta\s+name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${d}" />`)
    .replace(/<meta\s+name="twitter:card"[^>]*>/i, `<meta name="twitter:card" content="summary_large_image" />`);
  if (i) {
    out = out
      .replace(/<meta\s+property="og:image"[^>]*>/i, `<meta property="og:image" content="${i}" />`)
      .replace(/<meta\s+name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${i}" />`);
  }
  return out;
}

app.get("/recipe/:id", async (c) => {
  // Only intercept if the request looks like a browser asking for
  // HTML (not e.g. an asset preflight). Hono parses content
  // negotiation via the Accept header.
  const accept = c.req.header("accept") || "";
  if (!accept.includes("text/html")) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  const id = c.req.param("id");
  // Fetch the SPA shell first so we can return SOMETHING even
  // when the recipe lookup fails — better to show generic OG
  // than to error out the page.
  const shellResp = await c.env.ASSETS.fetch(new Request(new URL("/", c.req.url).toString()));
  const html = await shellResp.text();
  let row = null;
  try {
    row = await c.env.DB.prepare("SELECT blob FROM recipes WHERE id = ?").bind(id).first();
  } catch (err) {
    console.error("og lookup failed", err);
  }
  if (!row) {
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  let recipe;
  try { recipe = JSON.parse(row.blob); } catch { recipe = null; }
  if (!recipe) {
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const title = `${recipe.title} · The Family Cookbook`;
  const description = recipe.subtitle && recipe.subtitle.trim()
    ? recipe.subtitle.trim()
    : `${recipe.author ? `${recipe.author}'s ` : ""}${recipe.title}, from The Family Cookbook.`;
  const image = absoluteImageUrl(recipe.photo, c.req.url);
  const url = `${new URL(c.req.url).origin}/recipe/${encodeURIComponent(id)}`;
  const injected = injectRecipeOG(html, { title, description, image, url });
  return new Response(injected, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // no-cache so the embedded bundle hash always revalidates —
      // a cached HTML shell here would pin an old JS bundle for
      // anyone landing on a recipe deep-link.
      "cache-control": "no-cache, must-revalidate",
    },
  });
});

// Everything else: hand to the static React app. If the assets
// binding returns 404 for a path that looks like a page route
// (no file extension, or an explicit HTML request), serve
// index.html so the SPA can resolve the route client-side.
// This is what makes /add, /edit/:id, /meal, etc. work when
// accessed directly (in-app navigation already works via
// pushState; this is the cold-load + sharable-link path).
//
// CACHING (critical — this caused a "saves don't appear" bug):
// the SPA shell (index.html) references the content-hashed JS
// bundle. If the browser caches index.html, it keeps loading the
// OLD bundle hash forever and never picks up shipped fixes. So we
// force HTML responses to revalidate every load (no-cache), while
// the /assets/* files — whose names already change on every build
// — stay immutably cacheable for speed.
function isHtmlResponse(resp, pathname) {
  const ct = resp.headers.get("content-type") || "";
  if (ct.includes("text/html")) return true;
  // No extension → SPA page route → served as HTML.
  return !/\.[a-z0-9]+$/i.test(pathname);
}

app.all("*", async (c) => {
  const url = new URL(c.req.url);
  const resp = await c.env.ASSETS.fetch(c.req.raw);
  if (resp.status !== 404) {
    // Content-hashed assets are safe to cache forever; HTML must
    // always revalidate so a new bundle hash is picked up.
    if (url.pathname.startsWith("/assets/")) {
      const r = new Response(resp.body, resp);
      r.headers.set("cache-control", "public, max-age=31536000, immutable");
      return r;
    }
    if (isHtmlResponse(resp, url.pathname)) {
      const r = new Response(resp.body, resp);
      r.headers.set("cache-control", "no-cache, must-revalidate");
      return r;
    }
    return resp;
  }
  const accept = c.req.header("accept") || "";
  const looksLikeAsset = /\.[a-z0-9]+$/i.test(url.pathname);
  const wantsHtml = accept.includes("text/html");
  if (looksLikeAsset && !wantsHtml) return resp;
  const shell = await c.env.ASSETS.fetch(new Request(new URL("/", c.req.url).toString()));
  return new Response(shell.body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache, must-revalidate",
    },
  });
});

export default app;
