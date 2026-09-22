-- M6 (specs/006-m6-fit-to-ship/data-model.md): report, block, moderate, suspend, hide.

ALTER TABLE listeners ADD COLUMN IF NOT EXISTS suspended_at timestamptz NULL;
ALTER TABLE comments  ADD COLUMN IF NOT EXISTS removed_at   timestamptz NULL;   -- by moderation; distinct from deleted_at (the author)
ALTER TABLE clips     ADD COLUMN IF NOT EXISTS removed_at   timestamptz NULL;

CREATE TABLE moderation_actions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid        NOT NULL REFERENCES listeners(id),
  action      text        NOT NULL CHECK (action IN ('dismiss','remove','hide_show','suspend','unsuspend','unhide_show')),
  target_kind text        NOT NULL CHECK (target_kind IN ('comment','clip','profile','show')),
  target_id   text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reports (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind  text        NOT NULL CHECK (target_kind IN ('comment','clip','profile','show')),
  target_id    text        NOT NULL,                       -- comment id · clip id · listener id · feed URL
  reporter_id  uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,   -- anonymised when the reporter deletes their account
  reason       text        NOT NULL CHECK (reason IN ('spam','harassment','hate','sexual','violence','illegal','other')),
  note         text        NULL CHECK (char_length(note) <= 500),
  snapshot     jsonb       NOT NULL,                       -- the target as it was at report time (R7)
  created_at   timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz NULL,
  closed_by    uuid        NULL REFERENCES moderation_actions(id),
  close_reason text        NULL,                           -- the action, or already_gone / author_deleted
  UNIQUE (target_kind, target_id, reporter_id)             -- one report per reporter per target (FR-003)
);
CREATE INDEX reports_open   ON reports (created_at DESC) WHERE closed_at IS NULL;
CREATE INDEX reports_closed ON reports (closed_at) WHERE closed_at IS NOT NULL;
CREATE INDEX reports_by_reporter ON reports (reporter_id, target_kind);

CREATE TABLE blocks (
  blocker_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  blocked_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_by_blocked ON blocks (blocked_id);

CREATE TABLE hidden_feeds (
  feed_url  text        PRIMARY KEY,
  action_id uuid        NOT NULL REFERENCES moderation_actions(id),
  hidden_at timestamptz NOT NULL DEFAULT now()
);
