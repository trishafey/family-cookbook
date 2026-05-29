-- Per-recipe translations cache. Stored as a JSON object keyed by
-- language code:
--   { "pl": { title, subtitle, tips: [...], ingredients: [{item}, ...],
--             steps: [{t, d}, ...] } }
-- canonical_lang records which language the cook actually wrote in,
-- so we know which direction to translate. Defaults to "en" — most
-- of the family writes in English.
ALTER TABLE recipes ADD COLUMN translations TEXT;
ALTER TABLE recipes ADD COLUMN canonical_lang TEXT NOT NULL DEFAULT 'en';
