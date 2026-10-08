-- M24 lane A1 (specs/025-m24-gaps-and-look): safety and operations in Admin.

-- US1: statuses, chat messages and shared lists can be reported, and removed by the admin.
ALTER TABLE reports DROP CONSTRAINT reports_target_kind_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_kind_check
  CHECK (target_kind IN ('comment','clip','profile','show','episode','transcript','status','chat_message','list'));
ALTER TABLE moderation_actions DROP CONSTRAINT moderation_actions_target_kind_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_target_kind_check
  CHECK (target_kind IN ('comment','clip','profile','show','episode','transcript','status','chat_message','list'));
-- A removed chat message or list stays as a row (an accepted appeal brings it back); readers skip it.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS removed_at timestamptz NULL;
ALTER TABLE shared_lists ADD COLUMN IF NOT EXISTS removed_at timestamptz NULL;

-- US2: blocked words, edited in Admin. Stored lower-case and trimmed.
CREATE TABLE IF NOT EXISTS blocked_words (
  word     text        PRIMARY KEY CHECK (char_length(word) BETWEEN 1 AND 40 AND word = lower(btrim(word))),
  added_by uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now()
);

-- US3: system notices. listener_id NULL = everyone; else one listener (an account notice).
CREATE TABLE IF NOT EXISTS system_notices (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  listener_id uuid        NULL REFERENCES listeners(id) ON DELETE CASCADE,
  title       text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body        text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  link_label  text        NULL CHECK (char_length(link_label) BETWEEN 1 AND 40),
  link_route  text        NULL CHECK (char_length(link_route) BETWEEN 2 AND 200 AND link_route LIKE '/%'),
  push        boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  CHECK ((link_label IS NULL) = (link_route IS NULL))
);
CREATE INDEX IF NOT EXISTS system_notices_recent ON system_notices (listener_id, created_at DESC);

-- US4: small server settings the admin changes at run time (key 'maintenance' → { until, message }).
CREATE TABLE IF NOT EXISTS app_settings (
  key        text        PRIMARY KEY,
  value      jsonb       NOT NULL CHECK (jsonb_typeof(value) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL
);

-- US6: one appeal per moderation action (the UNIQUE key is the "once").
CREATE TABLE IF NOT EXISTS appeals (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  action_id   uuid        NOT NULL UNIQUE REFERENCES moderation_actions(id) ON DELETE CASCADE,
  text        text        NOT NULL CHECK (char_length(text) BETWEEN 1 AND 1000),
  state       text        NOT NULL DEFAULT 'open' CHECK (state IN ('open','accepted','rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz NULL,
  decided_by  uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS appeals_open ON appeals (state, created_at);

-- US17: "stop suggesting this person's statuses".
CREATE TABLE IF NOT EXISTS status_suggestion_mutes (
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  muted_id    uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listener_id, muted_id),
  CHECK (listener_id <> muted_id)
);

-- The admin record takes the new areas.
ALTER TABLE admin_audit DROP CONSTRAINT admin_audit_area_check;
ALTER TABLE admin_audit ADD CONSTRAINT admin_audit_area_check
  CHECK (area IN ('picks', 'issues', 'collections', 'discover', 'launch', 'accounts', 'users', 'reports', 'safety', 'notices', 'appeals'));
