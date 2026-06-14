-- Phase 4b-5: per-user UI preferences.
--
-- simple_mode: 0 / 1. When 1 the app renders the simplified
-- interface (used for less-technical cooks — strips AI surfaces,
-- filters, timing, etc.). Persisted server-side so an admin can
-- set it on someone's behalf from Admin · Users.
-- lang: 'en' / 'pl'. The default UI language the cook sees when
-- they sign in. They can still flip the bottom-right flag to
-- switch ad-hoc — this is just the starting point.
ALTER TABLE users ADD COLUMN simple_mode INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN lang        TEXT    NOT NULL DEFAULT 'en';
