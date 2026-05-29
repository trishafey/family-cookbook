// Feature flags for AI capabilities.
//
// All flags start OFF so the site can ship without any AI surfaces.
// Each flag is flipped on in its own merge commit after the matching
// `feat/ai-<capability>` branch is tested end-to-end on a Cloudflare
// Pages preview deployment.
//
// Anything that calls OpenAI (or an OpenAI-proxying Worker) MUST be
// gated by one of these flags. The curated chips in recipe.jsx and the
// hand-written PAIRINGS data in pairings.jsx are NOT AI — leave them
// visible regardless of these flags.
//
// URL-param override: visit any page with ?ff=extractText (or
// ?ff=extractText,familySays) to flip those flags ON for that browser
// session only. Use ?ff=all to flip everything on for testing.
// Production behaviour is governed by the literal values below.

const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
const overrides = new Set((params.get("ff") || "").split(",").filter(Boolean));
const on = (key) => overrides.has(key) || overrides.has("all");

export const FLAGS = {
  extractText:  on("extractText")  || true,   // Add Recipe → paste text → recipe draft
  extractUrl:   on("extractUrl")   || false,  // Add Recipe → URL → recipe draft
  extractImage: on("extractImage") || true,   // Add Recipe → photo of a recipe card → draft
  adjust:       on("adjust")       || true,   // Recipe page → "Adjust with AI" chips + free text
  familySays:   on("familySays")   || true,   // Recipe page → "AI summary · what the family does differently"
  pairings:     on("pairings")     || true,   // Recipe page → AI-generated pairing tiles (curated ones stay)
  needHelp:     on("needHelp")     || true,   // Recipe page + cook mode → "Need help cooking?" Q&A
  lab:          on("lab")          || true,   // The Lab / Kitchen experimentation view
};
