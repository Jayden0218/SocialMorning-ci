-- M19 (specs/020-m19-the-rest-of-xiaoyuzhou, data-model.md): profile photo and optional age/gender,
-- "not interested", likes with a note, listener playlists, pinned / unfriendly / voice comments,
-- announcement pictures and release time.

-- US1: profile. The photo lives in the launch-image Blob store (constitution v2.6.0: ≤ 200 KB each,
-- a total ceiling the server enforces). Age range and gender are optional, never shown on a
-- profile, used only as totals of 10 or more (FR-003, FR-073).
ALTER TABLE listeners ADD COLUMN avatar_url   text NULL CHECK (avatar_url IS NULL OR avatar_url LIKE 'https://%');
ALTER TABLE listeners ADD COLUMN avatar_path  text NULL;
ALTER TABLE listeners ADD COLUMN avatar_bytes int  NULL CHECK (avatar_bytes IS NULL OR avatar_bytes BETWEEN 1 AND 204800);
ALTER TABLE listeners ADD COLUMN age_range    text NULL CHECK (age_range IN ('under18','18-24','25-34','35-44','45-54','55+'));
ALTER TABLE listeners ADD COLUMN gender       text NULL CHECK (gender IN ('woman','man','another','unsaid'));
ALTER TABLE listeners ADD COLUMN likes_public boolean NOT NULL DEFAULT true;

-- US2: "Not interested in this episode" / "Stop recommending this show".
CREATE TABLE rec_dismissals (
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  kind        text        NOT NULL CHECK (kind IN ('episode','show')),
  item_key    text        NOT NULL CHECK (char_length(item_key) BETWEEN 1 AND 2048),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listener_id, kind, item_key)
);

-- US3: a like (喜欢) with an optional note of at most 140 characters.
CREATE TABLE episode_likes (
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  episode_id  text        NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  note        text        NULL CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 140),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listener_id, episode_id)
);
CREATE INDEX episode_likes_newest ON episode_likes (created_at DESC);

-- US4: listener playlists (合集). At most 50 per owner and 300 items each (checked by the server).
CREATE TABLE playlists (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  title      text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 60),
  is_public  boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);
CREATE INDEX playlists_by_owner ON playlists (owner_id) WHERE deleted_at IS NULL;
CREATE TABLE playlist_items (
  playlist_id uuid        NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  episode_id  text        NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  position    int         NOT NULL CHECK (position >= 0),
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, episode_id)
);

-- US5: one pinned top-level comment per episode, pinned by a host.
ALTER TABLE comments ADD COLUMN pinned_at timestamptz NULL;
ALTER TABLE comments ADD COLUMN pinned_by uuid NULL REFERENCES listeners(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX comments_one_pinned ON comments (episode_id) WHERE pinned_at IS NOT NULL;

-- US5: "unfriendly" marks. A comment folds at 5; who marked it is never returned.
CREATE TABLE comment_unfriendly (
  comment_id  uuid        NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, listener_id)
);

-- US6: voice comments (constitution v3.1.0): ≤ 60 s in the voice store, kept like a text comment;
-- the audio is deleted when the comment is deleted or removed.
ALTER TABLE comments ADD COLUMN voice_url  text NULL CHECK (voice_url IS NULL OR voice_url LIKE 'https://%');
ALTER TABLE comments ADD COLUMN voice_path text NULL;
ALTER TABLE comments ADD COLUMN voice_ms   int  NULL CHECK (voice_ms IS NULL OR voice_ms BETWEEN 1 AND 60000);

-- US10/US12: announcements carry up to 9 pictures and a release time.
ALTER TABLE announcements ADD COLUMN images jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(images) = 'array' AND jsonb_array_length(images) <= 9);
ALTER TABLE announcements ADD COLUMN release_at timestamptz NOT NULL DEFAULT now();
