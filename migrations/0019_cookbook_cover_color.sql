-- Per-cookbook accent colour for the book cover. NULL falls
-- back to the default green (--accent-cool) so existing
-- cookbooks stay unchanged until an owner picks a swatch.
ALTER TABLE cookbooks ADD COLUMN cover_color TEXT;
