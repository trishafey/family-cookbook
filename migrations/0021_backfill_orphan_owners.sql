-- ─── Backfill orphan owner memberships ───
-- Any cookbook whose owner_email has no matching row in
-- cookbook_members gets one inserted as owner. This recovers
-- Amber's case (where the bootstrap INSERT was swallowed) and
-- any other member who quietly slipped into the same state. The
-- self-heal in cookbookRole() already covers individuals on
-- their next write, but this pass cleans up the whole table at
-- once so display_order/audit queries also see a consistent
-- shape.
INSERT OR IGNORE INTO cookbook_members (cookbook_id, user_email, role, joined_at)
SELECT c.id, c.owner_email, 'owner', c.created_at
FROM cookbooks c
LEFT JOIN cookbook_members m
  ON m.cookbook_id = c.id AND m.user_email = c.owner_email
WHERE m.cookbook_id IS NULL
  AND c.owner_email IS NOT NULL;
