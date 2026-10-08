-- M24 lane A2 — the Studio gaps (specs/025-m24-gaps-and-look, US8–US14).

-- US8: comment control per show ('' = the whole show) or per episode. No row = open.
CREATE TABLE IF NOT EXISTS comment_policy (
  feed_url   text        NOT NULL,
  episode_id text        NOT NULL DEFAULT '',
  mode       text        NOT NULL CHECK (mode IN ('open', 'closed', 'review')),
  updated_by uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feed_url, episode_id)
);

-- US8: a comment held for review lives here, NOT in `comments`, so no read of `comments`
-- (threads, heat, counts, feeds, notices, search) can show it to anyone. Its author reads it
-- through listComments; Approve moves it into `comments`, Reject deletes it.
CREATE TABLE IF NOT EXISTS held_comments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id text        NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  author_id  uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  parent_id  uuid        NULL REFERENCES comments(id) ON DELETE CASCADE,
  body       text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  offset_ms  int         NULL CHECK (offset_ms >= 0),
  country    char(2)     NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS held_comments_by_episode ON held_comments (episode_id, created_at);
CREATE INDEX IF NOT EXISTS held_comments_by_author ON held_comments (author_id);

-- US10: the last fetch of a feed by the hourly job or by "Sync now".
CREATE TABLE IF NOT EXISTS feed_sync (
  feed_url   text        PRIMARY KEY,
  fetched_at timestamptz NOT NULL,
  ok         boolean     NOT NULL,
  error      text        NULL CHECK (char_length(error) <= 500),
  manual_at  timestamptz NULL
);

-- US11: an episode of a claimed show its creator hid from listeners.
CREATE TABLE IF NOT EXISTS hidden_episodes (
  feed_url  text        NOT NULL,
  guid      text        NOT NULL,
  hidden_by uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feed_url, guid)
);

-- US12: the subscriber-milestone message, sent once per show per milestone to the listener
-- who crossed it. Read back as a "From hosts" notice.
CREATE TABLE IF NOT EXISTS milestones_sent (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  feed_url    text        NOT NULL,
  milestone   int         NOT NULL CHECK (milestone IN (100, 1000, 10000)),
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  body        text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 200),
  sent_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feed_url, milestone)
);
CREATE INDEX IF NOT EXISTS milestones_sent_by_listener ON milestones_sent (listener_id, sent_at DESC);

-- US13: a paid episode's free preview, a [start, end) range in ms. No audio is copied.
ALTER TABLE hosted_episodes ADD COLUMN IF NOT EXISTS preview_start_ms int NULL;
ALTER TABLE hosted_episodes ADD COLUMN IF NOT EXISTS preview_end_ms   int NULL;
ALTER TABLE hosted_episodes ADD CONSTRAINT hosted_episodes_preview_range CHECK (
  (preview_start_ms IS NULL AND preview_end_ms IS NULL)
  OR (preview_start_ms >= 0 AND preview_end_ms > preview_start_ms AND preview_end_ms - preview_start_ms <= 600000));

-- US14: multiple-choice polls. A listener may now hold one vote per option; a single-choice
-- poll still keeps one (the vote code replaces it in one transaction).
ALTER TABLE polls ADD COLUMN IF NOT EXISTS multi boolean NOT NULL DEFAULT false;
ALTER TABLE poll_votes DROP CONSTRAINT IF EXISTS poll_votes_pkey;
ALTER TABLE poll_votes ADD PRIMARY KEY (poll_id, listener_id, option_idx);
