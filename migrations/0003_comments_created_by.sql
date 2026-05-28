-- Track who posted each comment (their Cf-Access email) so the UI can
-- decide whether to show a Delete button on each note.
ALTER TABLE comments ADD COLUMN created_by TEXT;
