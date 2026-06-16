-- ─── Normalize stored emails to lowercase ───
-- The cookbookRole() lookup is now case-insensitive (LOWER on
-- both sides), so this isn't strictly required for permissions
-- to work. Backfilling existing rows to lowercase keeps the
-- table self-consistent and means a stray case mismatch can't
-- masquerade as a different user across queries.
UPDATE cookbook_members SET user_email = LOWER(user_email) WHERE user_email != LOWER(user_email);

-- join_requests: same treatment.
UPDATE join_requests SET user_email = LOWER(user_email) WHERE user_email != LOWER(user_email);

-- Invitations were already lowercased at write time, but
-- invited_by uses whatever case CF returned. Normalize too.
UPDATE invitations SET email = LOWER(email) WHERE email IS NOT NULL AND email != LOWER(email);
UPDATE invitations SET invited_by = LOWER(invited_by) WHERE invited_by IS NOT NULL AND invited_by != LOWER(invited_by);
