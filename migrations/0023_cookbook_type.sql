-- ─── Cookbook type ───
-- Classifies a cookbook so Discover can filter on it. Optional —
-- legacy cookbooks have NULL until owners set one. Allowed values
-- enforced at the API: 'family-heirloom' | 'personal' | 'group'.
ALTER TABLE cookbooks ADD COLUMN cookbook_type TEXT;
