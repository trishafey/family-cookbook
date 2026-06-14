#!/usr/bin/env node
// Apply D1 migrations during Cloudflare Workers Builds.
//
// Runs as a `prebuild` step so it fires automatically before vite
// build on every push-triggered deploy. Outside CI (a developer
// running `npm run build` locally) it's a no-op — local D1 is
// applied separately via `npm run migrate:local`.
//
// Cloudflare exposes CI=1 in both Workers Builds and Pages build
// environments, plus their own WORKERS_CI / CF_PAGES flags. We
// accept any of them so this also runs under generic CI providers
// if the project ever moves.

import { spawnSync } from "node:child_process";

const inCI =
  process.env.CI === "1" ||
  process.env.CI === "true" ||
  process.env.WORKERS_CI === "1" ||
  process.env.WORKERS_CI === "true" ||
  process.env.CF_PAGES === "1" ||
  process.env.CF_PAGES === "true";

if (!inCI) {
  console.log("[prebuild] Not in CI — skipping remote D1 migrations.");
  process.exit(0);
}

console.log("[prebuild] Applying D1 migrations to remote (family-cookbook-db)…");
const result = spawnSync(
  "npx",
  ["wrangler", "d1", "migrations", "apply", "family-cookbook-db", "--remote"],
  { stdio: "inherit" }
);

if (result.status !== 0) {
  // Don't fail the build on a migration error — the worker has a
  // defensive ALTER fallback for new columns, and a permanent
  // migration failure here would lock us out of deploying any
  // worker fix. Log loudly so it shows up in the Cloudflare logs.
  console.error("[prebuild] Migration step failed (status " + result.status + ") — continuing build anyway.");
  process.exit(0);
}
console.log("[prebuild] D1 migrations applied.");
