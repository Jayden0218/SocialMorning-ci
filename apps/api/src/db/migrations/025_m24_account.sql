-- M24 lane A3 (spec 025, US15 + US16): redeem codes and changing the sign-in email.

-- US15: `redeem_codes` exists since 007 (code, grants, created_by, used_by, used_at). A code may
-- now be used by up to `max_uses` accounts, each account once (`redeem_uses` primary key). The
-- lookup is by `code_hash` = sha256 of the code, so the database never compares the typed code
-- character by character; the route then compares the stored code in constant time.
ALTER TABLE redeem_codes ADD COLUMN IF NOT EXISTS code_hash   bytea       NULL;
ALTER TABLE redeem_codes ADD COLUMN IF NOT EXISTS max_uses    int         NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 10000);
ALTER TABLE redeem_codes ADD COLUMN IF NOT EXISTS uses        int         NOT NULL DEFAULT 0 CHECK (uses >= 0);
ALTER TABLE redeem_codes ADD COLUMN IF NOT EXISTS note        text        NOT NULL DEFAULT '' CHECK (char_length(note) <= 200);
ALTER TABLE redeem_codes ADD COLUMN IF NOT EXISTS expires_at  timestamptz NULL;
ALTER TABLE redeem_codes ADD COLUMN IF NOT EXISTS disabled_at timestamptz NULL;
ALTER TABLE redeem_codes ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now();
UPDATE redeem_codes SET code_hash = sha256(convert_to(upper(code), 'UTF8')) WHERE code_hash IS NULL;
UPDATE redeem_codes SET uses = 1 WHERE used_by IS NOT NULL AND uses = 0;
CREATE UNIQUE INDEX IF NOT EXISTS redeem_codes_by_hash ON redeem_codes (code_hash);
CREATE INDEX IF NOT EXISTS redeem_codes_recent ON redeem_codes (created_at DESC);

-- One row per (code, account): the primary key is the "one use per account" rule (guard G-M24-A3-1).
CREATE TABLE IF NOT EXISTS redeem_uses (
  code        text        NOT NULL REFERENCES redeem_codes(code) ON DELETE CASCADE,
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  used_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code, listener_id)
);

-- US16: one pending change per account. Only a hash of the code is kept (like email_codes).
CREATE TABLE IF NOT EXISTS email_changes (
  listener_id uuid        PRIMARY KEY REFERENCES listeners(id) ON DELETE CASCADE,
  new_email   citext      NOT NULL,
  code_hash   bytea       NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  tries       int         NOT NULL DEFAULT 0
);
