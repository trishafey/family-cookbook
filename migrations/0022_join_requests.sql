-- ─── Join requests for public cookbooks ───
-- When someone discovers a public cookbook they don't belong to,
-- they can request to join. Owners + editors of that cookbook
-- see a pending request and pick the role (or decline).
CREATE TABLE IF NOT EXISTS join_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cookbook_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  decided_role TEXT,
  UNIQUE(cookbook_id, user_email)
);
CREATE INDEX IF NOT EXISTS join_requests_cookbook ON join_requests(cookbook_id, status);
CREATE INDEX IF NOT EXISTS join_requests_user ON join_requests(user_email, status);
