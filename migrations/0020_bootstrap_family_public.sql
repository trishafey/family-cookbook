-- ─── Bootstrap family cookbook → public by default ───
-- Going forward, every new family cookbook is created public so it
-- shows up in the directory and can be followed. Backfill the
-- original bootstrap cookbook to match if it's still private.
UPDATE cookbooks SET visibility = 'public' WHERE id = 'family-cookbook' AND visibility = 'private';
