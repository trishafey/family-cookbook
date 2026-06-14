-- Per-cookbook languages. JSON array of ISO codes, e.g. ["en","es"].
-- Capped to 3 entries client-side. NULL behaves as ["en"] so
-- existing cookbooks stay English-only until edited.
ALTER TABLE cookbooks ADD COLUMN languages TEXT;
