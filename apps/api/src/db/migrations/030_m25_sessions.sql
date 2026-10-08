-- M25 lane SB (spec 026, Phase 4): signed-in devices, session lifetime + rotation, the admin second factor, test purchases.

-- Devices: each session gets a public id (the token hash never leaves the server) and the
-- country of the network it signed in from (two letters, `x-vercel-ip-country`, like listeners.country).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS sessions_id ON sessions (id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS country char(2) NULL CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');

-- Rotation: a token is swapped for a new one at most once a day. The old row stays valid for a
-- short grace window (`replaced_at`) so requests already on their way do not fail, and points at
-- its successor: signing the new one out removes the old one too (ON DELETE CASCADE), and a
-- pepper re-key of the new one carries the link along (ON UPDATE CASCADE).
-- `created_at` is copied to the new row, so the absolute lifetime counts from the first sign-in.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS rotated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS replaced_at timestamptz NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS replaced_by bytea NULL REFERENCES sessions(token_hash) ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS sessions_replaced_by ON sessions (replaced_by) WHERE replaced_by IS NOT NULL;

-- The admin second factor: an emailed code, kept hashed on the session it unlocks (one code per
-- session, 10 minutes, 5 tries). `second_factor_at` set = this session passed it.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS second_factor_at      timestamptz NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS second_factor_code    bytea       NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS second_factor_sent_at timestamptz NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS second_factor_tries   int         NOT NULL DEFAULT 0;

-- Test purchases (Google licence testers): refused in production unless ALLOW_TEST_PURCHASES is
-- set; when allowed they are kept, marked, and left out of a creator's earnings.
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS test boolean NOT NULL DEFAULT false;
