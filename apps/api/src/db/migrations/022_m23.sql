-- M23 (spec 024): hardening. Rate counters, our own error log, purchase-to-account binding, and
-- the index every comment post needs (the per-author rate floor read the whole table).

-- US2/US8: fixed-window counters (key = 'code:ip:<addr>', 'code:global', 'errors:ip:<addr>', …).
CREATE TABLE IF NOT EXISTS rate_counters (
  key          text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        int         NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- US8: our own error log (owner decision 2026-10-07: no outside service).
CREATE TABLE IF NOT EXISTS error_reports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  listener_id uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  scope       text        NOT NULL CHECK (char_length(scope) BETWEEN 1 AND 80),
  message     text        NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  stack       text        NULL CHECK (char_length(stack) <= 2048),
  app_version text        NOT NULL DEFAULT '',
  platform    text        NOT NULL DEFAULT '',
  count       int         NOT NULL DEFAULT 1,
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, message, app_version, platform)
);
CREATE INDEX IF NOT EXISTS error_reports_recent ON error_reports (last_seen DESC);

-- US4: a store purchase is tied to the account that bought it (older rows stay NULL = valid).
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS account_hash text NULL;

-- US6: the per-author comment rate floor (routes/social/comments.ts, voice-comments.ts, studio comments).
CREATE INDEX IF NOT EXISTS comments_by_author ON comments (author_id, created_at DESC);
