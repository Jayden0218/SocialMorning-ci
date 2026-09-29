-- M13 — shows created in the Studio, whose audio the app hosts (constitution v2.3.0).
-- specs/013-m13-create-show. The owner of a created show ALSO gets a proven creator_claims row
-- for the show's own feed address, so every M11 Studio check works unchanged (plan R3).

CREATE TABLE hosted_shows (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  feed_url    text        NOT NULL UNIQUE,
  title       text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  description text        NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  author      text        NOT NULL DEFAULT '' CHECK (char_length(author) <= 100),
  language    text        NOT NULL DEFAULT 'zh' CHECK (language ~ '^[a-z]{2}(-[A-Za-z]{2,4})?$'),
  category    text        NOT NULL DEFAULT 'Society & Culture' CHECK (char_length(category) BETWEEN 1 AND 60),
  explicit    boolean     NOT NULL DEFAULT false,
  cover_url   text        NULL CHECK (cover_url IS NULL OR cover_url LIKE 'https://%'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz NULL
);
CREATE INDEX hosted_shows_by_owner ON hosted_shows (owner_id);

CREATE TABLE hosted_episodes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id       uuid        NOT NULL REFERENCES hosted_shows(id) ON DELETE CASCADE,
  guid          text        NOT NULL UNIQUE,
  episode_id    text        NOT NULL,                 -- fnv1a64(feed_url || U+0001 || guid): the app's id
  title         text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description   text        NOT NULL DEFAULT '' CHECK (char_length(description) <= 20000),
  audio_url     text        NOT NULL CHECK (audio_url LIKE 'https://%'),
  audio_bytes   bigint      NOT NULL CHECK (audio_bytes > 0),
  audio_type    text        NOT NULL,
  duration_ms   int         NULL CHECK (duration_ms > 0),
  published_at  timestamptz NOT NULL DEFAULT now(),
  created_by    uuid        NULL REFERENCES listeners(id) ON DELETE SET NULL,
  deleted_at    timestamptz NULL
);
CREATE INDEX hosted_episodes_by_show ON hosted_episodes (show_id, published_at DESC) WHERE deleted_at IS NULL;
