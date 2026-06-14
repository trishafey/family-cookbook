-- Per-user cookbook ordering. Each member can drag-reorder the
-- cookbooks in their library; "set as default" writes display_order
-- = 0 and shifts everything else down. NULL means "not yet ordered"
-- and sorts after explicit orders.
ALTER TABLE cookbook_members ADD COLUMN display_order INTEGER;
