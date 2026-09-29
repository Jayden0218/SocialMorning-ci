-- M11 — the Studio. specs/011-m11-studio/data-model.md
--
-- The owner of a show is the PROVEN `creator_claims` row (M10b); it is never copied into
-- `show_members`, which holds operators only. Every Studio read is scoped by feed_url and
-- checked against one of those two on every request (guard G-A1).

CREATE TABLE show_members (
  feed_url    text        NOT NULL,
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  role        text        NOT NULL DEFAULT 'operator' CHECK (role = 'operator'),
  added_by    uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feed_url, listener_id)
);
CREATE INDEX show_members_by_listener ON show_members (listener_id);

CREATE TABLE show_mutes (
  feed_url    text        NOT NULL,
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  muted_by    uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feed_url, listener_id)
);

-- research R4: `subscriptions` is overwritten on a resubscribe, so it cannot give a trend.
-- This is append-only; `subscriptions.merge()` writes a row when the live state flips.
CREATE TABLE subscription_events (
  id          bigserial   PRIMARY KEY,
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  feed_url    text        NOT NULL,
  kind        text        NOT NULL CHECK (kind IN ('sub', 'unsub')),
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscription_events_by_feed ON subscription_events (feed_url, at);

-- Backfill: the best history that exists. Exact from this migration on; before it, only the
-- latest change of each row is known (the Studio says "history since <date>").
INSERT INTO subscription_events (listener_id, feed_url, kind, at)
  SELECT listener_id, feed_url, 'sub', created_at FROM subscriptions;
INSERT INTO subscription_events (listener_id, feed_url, kind, at)
  SELECT listener_id, feed_url, 'unsub', deleted_at FROM subscriptions WHERE deleted_at IS NOT NULL;

CREATE TABLE share_events (
  id          bigserial   PRIMARY KEY,
  listener_id uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  target_kind text        NOT NULL CHECK (target_kind IN ('episode', 'clip', 'show')),
  target_id   text        NOT NULL CHECK (length(target_id) BETWEEN 1 AND 2048),
  feed_url    text        NOT NULL,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX share_events_by_feed ON share_events (feed_url, at);

CREATE TABLE announcements (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_url    text        NOT NULL,
  author_id   uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  body        text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  edited_at   timestamptz NULL,
  pushed_at   timestamptz NULL,
  deleted_at  timestamptz NULL
);
CREATE INDEX announcements_by_feed ON announcements (feed_url, created_at DESC);

CREATE TABLE polls (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_url    text        NOT NULL,
  episode_id  text        NULL REFERENCES episodes(id),
  question    text        NOT NULL CHECK (char_length(question) BETWEEN 1 AND 100),
  ends_at     timestamptz NOT NULL,
  closed_at   timestamptz NULL,
  created_by  uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX polls_by_feed ON polls (feed_url, created_at DESC);

CREATE TABLE poll_options (
  poll_id     uuid        NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  idx         smallint    NOT NULL CHECK (idx BETWEEN 0 AND 5),
  label       text        NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
  PRIMARY KEY (poll_id, idx)
);

-- One vote per listener per poll is this primary key (guard G-P1).
CREATE TABLE poll_votes (
  poll_id     uuid        NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  option_idx  smallint    NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, listener_id),
  FOREIGN KEY (poll_id, option_idx) REFERENCES poll_options (poll_id, idx) ON DELETE CASCADE
);

-- NULL in any column means "use what the feed says".
CREATE TABLE show_overrides (
  feed_url          text        PRIMARY KEY,
  title             text        NULL CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 100),
  description       text        NULL CHECK (description IS NULL OR char_length(description) <= 4000),
  cover_url         text        NULL CHECK (cover_url IS NULL OR cover_url LIKE 'https://%'),
  theme_colour      text        NULL CHECK (theme_colour IS NULL OR theme_colour ~ '^#[0-9a-fA-F]{6}$'),
  milestone_message text        NULL CHECK (milestone_message IS NULL OR char_length(milestone_message) <= 120),
  hosts             jsonb       NULL,
  links             jsonb       NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL
);

-- research R6: a host hide is reversible, unlike /mod's remove, so it has its own columns.
ALTER TABLE comments ADD COLUMN host_hidden_at timestamptz NULL;
ALTER TABLE comments ADD COLUMN host_hidden_by uuid NULL REFERENCES listeners(id) ON DELETE SET NULL;

ALTER TABLE moderation_actions DROP CONSTRAINT moderation_actions_action_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_action_check
  CHECK (action IN ('dismiss','remove','hide_show','suspend','unsuspend','unhide_show','host_hide','host_unhide'));

-- research R8: announcements reuse the "never tell a device twice" key; episode_id holds the announcement id.
ALTER TABLE push_sent DROP CONSTRAINT push_sent_kind_check;
ALTER TABLE push_sent ADD CONSTRAINT push_sent_kind_check
  CHECK (kind IN ('new_episode', 'popular', 'announcement'));
