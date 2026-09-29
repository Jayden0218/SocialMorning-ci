-- M14 — Studio parity with the 小宇宙 podcaster studio (specs/014-m14-studio-parity).

-- US2: a host is a real account, invited by a one-use link that expires (FR-02).
CREATE TABLE show_invites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_url    text        NOT NULL,
  token_hash  bytea       NOT NULL UNIQUE,
  created_by  uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz NULL,
  used_by     uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  revoked_at  timestamptz NULL
);
CREATE INDEX show_invites_by_feed ON show_invites (feed_url, created_at DESC);

CREATE TABLE show_hosts (
  feed_url    text        NOT NULL,
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feed_url, listener_id)
);

-- US4: drafts and per-episode covers. "Scheduled" = published with a future published_at.
ALTER TABLE hosted_episodes ADD COLUMN status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published'));
ALTER TABLE hosted_episodes ADD COLUMN cover_url text NULL CHECK (cover_url IS NULL OR cover_url LIKE 'https://%');

-- US3 + US7: typed contacts and the tips switch, for any show (claimed or created), beside the other display settings.
ALTER TABLE show_overrides ADD COLUMN contacts jsonb NULL;
ALTER TABLE show_overrides ADD COLUMN tips_enabled boolean NOT NULL DEFAULT false;
