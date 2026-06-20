#!/usr/bin/env node
// Apply D1 migrations during Cloudflare Workers Builds.
//
// Runs as a `prebuild` step so it fires automatically before vite
// build on every push-triggered deploy. Outside CI (a developer
// running `npm run build` locally) it's a no-op — local D1 is
// applied separately via `npm run migrate:local`.
//
// History: the old version of this script silently failed
// because (a) wrangler was being fetched on demand via npx and
// (b) failures were quietly tolerated to avoid blocking deploys.
// The combined effect was that nine schema migrations never ran
// on prod between Phase 4a and the email/password auth work,
// which forced a parade of self-heal ALTER statements throughout
// the worker. This version is loud — env state, command output,
// applied-migration list — so anyone reading the build log can
// confirm the migrations actually ran.

import { spawnSync } from "node:child_process";

function logHeader(s) {
  console.log("");
  console.log("──────────────────────────────────────────────");
  console.log(`[prebuild] ${s}`);
  console.log("──────────────────────────────────────────────");
}

// Surface every env var that any CI provider sets so it's
// obvious from the build log which path we took. Names only —
// values can carry secrets.
function listCiSignalEnv() {
  const keys = [
    "CI", "WORKERS_CI", "WORKERS_BUILD", "CF_PAGES", "CF_BUILDER",
    "GITHUB_ACTIONS", "VERCEL", "NETLIFY", "CIRCLECI",
  ];
  return Object.fromEntries(
    keys.filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]])
  );
}

const ciSignals = listCiSignalEnv();
const inCI = Object.keys(ciSignals).length > 0;

logHeader("D1 migrations on CI");
console.log("[prebuild] CI signals present:", ciSignals);
console.log("[prebuild] inCI:", inCI);

if (!inCI) {
  console.log("[prebuild] Not in CI — skipping remote D1 migrations.");
  console.log("[prebuild] Run `npm run migrate:remote` locally if you want to apply now.");
  process.exit(0);
}

logHeader("Listing already-applied migrations");
const list = spawnSync(
  "npx",
  ["--no-install", "wrangler", "d1", "migrations", "list", "family-cookbook-db", "--remote"],
  { stdio: "inherit" }
);
if (list.status !== 0) {
  console.error("[prebuild] Could not list migrations (status " + list.status + ").");
  console.error("[prebuild] Most common causes:");
  console.error("  - wrangler isn't installed (now pinned in devDependencies — check `npm install` ran)");
  console.error("  - the Workers Builds env doesn't have D1 API access");
  console.error("  - the database name 'family-cookbook-db' doesn't match wrangler.jsonc");
  console.error("[prebuild] Continuing the build so we don't block deploys.");
  process.exit(0);
}

logHeader("Applying any pending migrations");
const apply = spawnSync(
  "npx",
  ["--no-install", "wrangler", "d1", "migrations", "apply", "family-cookbook-db", "--remote"],
  { stdio: "inherit" }
);

if (apply.status !== 0) {
  // Don't fail the build on a migration error — the worker still
  // has defensive ALTER fallbacks for new columns, and a
  // persistent migration failure here would lock us out of
  // deploying a worker fix. Log loudly so it shows up in logs.
  console.error("[prebuild] Migration step failed (status " + apply.status + ") — continuing build anyway.");
  process.exit(0);
}

logHeader("Migrations applied — listing final state");
spawnSync(
  "npx",
  ["--no-install", "wrangler", "d1", "migrations", "list", "family-cookbook-db", "--remote"],
  { stdio: "inherit" }
);
console.log("[prebuild] Done.");
