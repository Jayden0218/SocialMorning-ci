-- M10b — the rest. specs/010-m10b-the-rest/data-model.md
--
-- `library_items.deleted_at` is a TOMBSTONE, as in M8's subscriptions: a deleted row cannot
-- sync (phone B would revive it). Every read that means "live" carries `deleted_at IS NULL`,
-- and no read of this table may omit `listener_id = $me` (guard G-P1): favourites, notes and
-- searches are private to their owner.

CREATE TABLE library_items (
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  kind        text        NOT NULL CHECK (kind IN ('fav_episode', 'fav_comment', 'moment', 'search')),
  item_key    text        NOT NULL CHECK (length(item_key) BETWEEN 1 AND 512),
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL,
  deleted_at  timestamptz NULL,
  PRIMARY KEY (listener_id, kind, item_key)
);

CREATE TABLE push_tokens (
  token       text        PRIMARY KEY,
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  platform    text        NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_ok_at  timestamptz NULL
);
CREATE INDEX push_tokens_by_listener ON push_tokens (listener_id);

CREATE TABLE push_prefs (
  listener_id  uuid    PRIMARY KEY REFERENCES listeners(id) ON DELETE CASCADE,
  new_episodes boolean NOT NULL DEFAULT true,
  popular      boolean NOT NULL DEFAULT true
);

-- "Never tell a device twice" (guard G-N1) is this primary key.
CREATE TABLE push_sent (
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  episode_id  text        NOT NULL,
  kind        text        NOT NULL CHECK (kind IN ('new_episode', 'popular')),
  sent_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listener_id, episode_id, kind)
);

CREATE TABLE feedback (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  listener_id uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  kind        text        NOT NULL CHECK (length(kind) BETWEEN 1 AND 60),
  body        text        NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  app_version text        NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feedback_images (
  feedback_id uuid        NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  n           int         NOT NULL CHECK (n BETWEEN 1 AND 3),
  mime        text        NOT NULL CHECK (mime IN ('image/jpeg', 'image/png')),
  bytes       bytea       NOT NULL CHECK (octet_length(bytes) <= 250000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feedback_id, n)
);

-- Country only (guard G-I1): two letters, never a city or an address.
ALTER TABLE listeners ADD COLUMN country char(2) NULL;

CREATE TABLE creator_claims (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  feed_url    text        NOT NULL,
  code        text        NOT NULL UNIQUE,
  status      text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'proven', 'revoked')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  proven_at   timestamptz NULL
);
CREATE UNIQUE INDEX creator_claims_one_proven ON creator_claims (feed_url) WHERE status = 'proven';

ALTER TABLE episodes ADD COLUMN media_kind text NOT NULL DEFAULT 'audio' CHECK (media_kind IN ('audio', 'video'));

-- US10 (payments) — created now so the schema is one step; unused until the owner's store accounts exist.
CREATE TABLE purchases (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  listener_id   uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  store         text        NOT NULL CHECK (store IN ('apple', 'google')),
  product_id    text        NOT NULL,
  store_txn_id  text        NOT NULL UNIQUE,
  status        text        NOT NULL CHECK (status IN ('active', 'expired', 'refunded')),
  expires_at    timestamptz NULL,
  amount_micros bigint      NULL,
  currency      char(3)     NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE entitlements (
  listener_id        uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  kind               text        NOT NULL CHECK (kind IN ('plus', 'show')),
  ref                text        NOT NULL DEFAULT '',
  until              timestamptz NULL,
  source_purchase_id uuid        NULL REFERENCES purchases(id) ON DELETE CASCADE,
  PRIMARY KEY (listener_id, kind, ref)
);
CREATE TABLE redeem_codes (
  code       text        PRIMARY KEY,
  grants     jsonb       NOT NULL,
  created_by uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  used_by    uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  used_at    timestamptz NULL
);
CREATE TABLE tips (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_listener uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  to_feed_url   text        NOT NULL,
  purchase_id   uuid        NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now()
);
