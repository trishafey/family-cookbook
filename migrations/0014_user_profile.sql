-- Phase 4b-2 follow-up: user profile fields.
--
-- Adds first_name, last_name, phone to the users table.
-- First-time cooks (and existing family members whose row was
-- pre-seeded with NULL profile fields) are gated behind a
-- profile-setup form on the next authenticated render until
-- these are filled in. Phone-number MFA is a later state.
--
-- A future "Account settings" page will let cooks edit these.
ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name  TEXT;
ALTER TABLE users ADD COLUMN phone      TEXT;
