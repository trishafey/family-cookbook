-- Phase 4b-2: cookbook invitations.
--
-- An invitation is a token-addressed pre-membership row. The
-- inviter creates one (POST /api/admin/cookbooks/:id/invitations),
-- the worker returns a magic link
-- (https://.../invite/<token>) that the inviter shares however
-- they want. Anyone who follows the link sees the invitation
-- detail (no auth needed — the token is unguessable), and after
-- signing in their accept call inserts a cookbook_members row
-- and marks the invitation accepted.
--
-- email lets the inviter pre-address the invitation (a UX cue
-- only; we don't enforce it server-side because Cloudflare Access
-- doesn't always give us the address before sign-in).
CREATE TABLE IF NOT EXISTS invitations (
  token        TEXT    PRIMARY KEY,
  cookbook_id  TEXT    NOT NULL,
  email        TEXT,
  role         TEXT    NOT NULL,
  invited_by   TEXT    NOT NULL,
  created_at   TEXT    NOT NULL,
  expires_at   TEXT    NOT NULL,
  accepted_at  TEXT,
  accepted_by  TEXT
);
CREATE INDEX IF NOT EXISTS invitations_cookbook ON invitations(cookbook_id);
CREATE INDEX IF NOT EXISTS invitations_email    ON invitations(email);
CREATE INDEX IF NOT EXISTS invitations_unaccepted ON invitations(accepted_at);
