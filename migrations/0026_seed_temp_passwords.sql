-- ─── Seed Tomato123 as the temporary password ───
-- Lets every cook who was created under the Cloudflare Access
-- flow sign in via email + password without a separate reset
-- step. The hash is PBKDF2-SHA256 of "Tomato123" with the
-- shared fixed salt below (100,000 iterations, 32-byte output).
-- All future password changes write a per-user random salt
-- the normal way; this only seeds rows that have no password
-- yet, so nobody's real password is touched.
UPDATE users
   SET password_hash = '659ea802e67cb4ae63aa255ab2b7e260ba2dfcd7e934f562bea5eea02404d252',
       password_salt = '686569726c6f6f6d2d74656d702d3032'
 WHERE password_hash IS NULL;
