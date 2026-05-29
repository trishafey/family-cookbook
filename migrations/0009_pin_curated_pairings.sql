-- Hand-curated cross-pinned pairings for recipes that don't yet
-- have AI-generated pairings (or where the cook wants specific
-- pins regardless of what the AI proposes).
--
-- Each block looks up the source recipe by title pattern, then
-- writes the IDs of the desired pinned recipes (also looked up
-- by title pattern) into both pairings.pinnedFromBook AND
-- pairings.fromBook on the source recipe's blob.
--
-- Why both fields:
--   • fromBook makes the tiles render immediately, even before AI
--     pairings have been generated
--   • pinnedFromBook keeps them present after the cook hits the
--     regenerate-with-AI button (the worker preserves pinned IDs)
--
-- Title-pattern lookups gracefully handle missing recipes: a sub-
-- query that matches nothing contributes nothing to json_group_array,
-- and the outer UPDATE matches zero rows if the source doesn't
-- exist. So this migration is safe to apply on any database — it
-- only acts where both ends of a relationship exist.
--
-- json_set on a non-existent nested path creates the intermediate
-- objects, so recipes with no prior pairings field at all still
-- get a well-formed pairings object after this runs.
--
-- Existing recipe.pairings.suggestions (AI-generated sauce/side
-- cards) are NOT touched — json_set on a specific path leaves
-- sibling keys untouched.

-- ─── 1. Goulash pins: kopytki, potato pancakes, covid bread ───
UPDATE recipes
SET blob = json_set(blob,
  '$.pairings.pinnedFromBook', (
    SELECT json_group_array(id) FROM recipes
     WHERE LOWER(json_extract(blob,'$.title')) LIKE '%kopytki%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%potato pancake%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%covid bread%'
  ),
  '$.pairings.fromBook', (
    SELECT json_group_array(id) FROM recipes
     WHERE LOWER(json_extract(blob,'$.title')) LIKE '%kopytki%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%potato pancake%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%covid bread%'
  )
)
WHERE LOWER(json_extract(blob,'$.title')) LIKE '%goulash%';

-- ─── 2. Kopytki pins: goulash ───
UPDATE recipes
SET blob = json_set(blob,
  '$.pairings.pinnedFromBook', (
    SELECT json_group_array(id) FROM recipes
     WHERE LOWER(json_extract(blob,'$.title')) LIKE '%goulash%'
  ),
  '$.pairings.fromBook', (
    SELECT json_group_array(id) FROM recipes
     WHERE LOWER(json_extract(blob,'$.title')) LIKE '%goulash%'
  )
)
WHERE LOWER(json_extract(blob,'$.title')) LIKE '%kopytki%';

-- ─── 3. Potato pancakes pins: goulash ───
UPDATE recipes
SET blob = json_set(blob,
  '$.pairings.pinnedFromBook', (
    SELECT json_group_array(id) FROM recipes
     WHERE LOWER(json_extract(blob,'$.title')) LIKE '%goulash%'
  ),
  '$.pairings.fromBook', (
    SELECT json_group_array(id) FROM recipes
     WHERE LOWER(json_extract(blob,'$.title')) LIKE '%goulash%'
  )
)
WHERE LOWER(json_extract(blob,'$.title')) LIKE '%potato pancake%';

-- ─── 4. Spring wild leek herbed butter pins: covid bread, kopytki, pierogies ───
UPDATE recipes
SET blob = json_set(blob,
  '$.pairings.pinnedFromBook', (
    SELECT json_group_array(id) FROM recipes
     WHERE LOWER(json_extract(blob,'$.title')) LIKE '%covid bread%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%kopytki%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%pierogi%'
  ),
  '$.pairings.fromBook', (
    SELECT json_group_array(id) FROM recipes
     WHERE LOWER(json_extract(blob,'$.title')) LIKE '%covid bread%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%kopytki%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%pierogi%'
  )
)
WHERE (LOWER(json_extract(blob,'$.title')) LIKE '%wild leek%'
    OR LOWER(json_extract(blob,'$.title')) LIKE '%leek herbed butter%'
    OR LOWER(json_extract(blob,'$.title')) LIKE '%leek butter%');

-- ─── 5. Babcia Krystyna's Apple Meringue Pie pins: turkey, polish vegetable salad ───
-- These are holiday staples that show up at the same Polish
-- Christmas / Easter table as the pie.
UPDATE recipes
SET blob = json_set(blob,
  '$.pairings.pinnedFromBook', (
    SELECT json_group_array(id) FROM recipes
     WHERE LOWER(json_extract(blob,'$.title')) LIKE '%turkey%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%polish vegetable salad%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%sa%atka jarzynowa%'
  ),
  '$.pairings.fromBook', (
    SELECT json_group_array(id) FROM recipes
     WHERE LOWER(json_extract(blob,'$.title')) LIKE '%turkey%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%polish vegetable salad%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%sa%atka jarzynowa%'
  )
)
WHERE LOWER(json_extract(blob,'$.title')) LIKE '%krystyna%apple%meringue%'
   OR LOWER(json_extract(blob,'$.title')) LIKE '%apple meringue pie%';

-- ─── 6. Ryszard's Polish Beef Tartare pins: covid bread ───
UPDATE recipes
SET blob = json_set(blob,
  '$.pairings.pinnedFromBook', (
    SELECT json_group_array(id) FROM recipes
     WHERE LOWER(json_extract(blob,'$.title')) LIKE '%covid bread%'
  ),
  '$.pairings.fromBook', (
    SELECT json_group_array(id) FROM recipes
     WHERE LOWER(json_extract(blob,'$.title')) LIKE '%covid bread%'
  )
)
WHERE (LOWER(json_extract(blob,'$.title')) LIKE '%beef tartare%'
    OR LOWER(json_extract(blob,'$.title')) LIKE '%beef tarta%'
    OR LOWER(json_extract(blob,'$.title')) LIKE '%polish beef tart%');

-- ─── 7. Polish Vegetable Salad pins: turkey, krystyna's apple pie ───
-- Symmetric to #5: the salad is a holiday staple too, and it
-- belongs on the same table as the turkey and apple pie. If more
-- Polish Christmas / Easter dishes are added later, they can be
-- pinned here too (re-run a similar UPDATE in a follow-on
-- migration, or pin them in the UI).
UPDATE recipes
SET blob = json_set(blob,
  '$.pairings.pinnedFromBook', (
    SELECT json_group_array(id) FROM recipes
     WHERE LOWER(json_extract(blob,'$.title')) LIKE '%turkey%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%krystyna%apple%meringue%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%apple meringue pie%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%pierniki%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%gingerbread%'
  ),
  '$.pairings.fromBook', (
    SELECT json_group_array(id) FROM recipes
     WHERE LOWER(json_extract(blob,'$.title')) LIKE '%turkey%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%krystyna%apple%meringue%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%apple meringue pie%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%pierniki%'
        OR LOWER(json_extract(blob,'$.title')) LIKE '%gingerbread%'
  )
)
WHERE LOWER(json_extract(blob,'$.title')) LIKE '%polish vegetable salad%'
   OR LOWER(json_extract(blob,'$.title')) LIKE '%sa%atka jarzynowa%';
