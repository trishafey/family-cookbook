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

export const FLAGS = {
  extractText:  false,  // Add Recipe → paste text → recipe draft
  extractUrl:   false,  // Add Recipe → URL → recipe draft
  extractImage: false,  // Add Recipe → photo of a recipe card → draft
  adjust:       false,  // Recipe page → "Adjust with AI" chips + free text
  familySays:   false,  // Recipe page → "AI summary · what the family does differently"
  pairings:     false,  // Recipe page → AI-generated pairing tiles (curated ones stay)
  needHelp:     false,  // Recipe page + cook mode → "Need help cooking?" Q&A
  lab:          false,  // The Lab / Kitchen experimentation view
};
