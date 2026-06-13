-- Phase 4b-4: admin tier + family cookbook bootstrap.
--
-- Two changes:
--   1. users.is_admin — Patricia (the family cookbook's
--      historical operator) sees every cookbook in the system
--      and can write to any of them, without being listed as a
--      visible member. New sign-ups get is_admin=0.
--   2. cookbook_members.hidden was considered but rejected —
--      admin access is a separate code path so admins don't
--      pollute member tables. See worker/index.js cookbookRole.
--
-- The existing "family-cookbook" (the Heirloom Family Cookbook)
-- stays as Patricia's family cookbook — she owns it, the other
-- family members are editors. Going forward, new sign-ups get
-- BOTH a personal cookbook ("<Name>'s Cookbook") AND a family
-- cookbook ("<Name>'s Family Cookbook") via ensureUserBootstrap.
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

UPDATE users SET is_admin = 1 WHERE email = 'patricia.fejdasz@gmail.com';
