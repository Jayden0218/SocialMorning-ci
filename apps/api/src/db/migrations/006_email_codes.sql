-- Email sign-in codes (owner, 2026-09-27): passwords are gone from the app. One live code
-- per email; only a hash is stored. A row is deleted when used, after 5 wrong tries, or
-- replaced by a newer request.
CREATE TABLE email_codes (
  email      citext PRIMARY KEY,
  code_hash  bytea NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  attempts   int NOT NULL DEFAULT 0
);
