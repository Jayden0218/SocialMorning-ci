-- M20 (specs/021-m20-the-gaps, data-model.md): Google / Facebook sign-in, the text of voice
-- posts and voice comments, comment images (used only after gate G1), Google Play purchases,
-- paid episodes on Studio-hosted shows.

-- US5: a Google or Facebook account linked to a listener. One provider account maps to at most
-- one listener; a listener links at most one account per provider. listeners.email stays
-- NOT NULL, so email is always a way in and unlinking never locks anyone out (FR-015).
CREATE TABLE listener_identities (
  provider    text        NOT NULL CHECK (provider IN ('google','facebook')),
  subject     text        NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 255),
  listener_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  email       citext      NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject),
  UNIQUE (listener_id, provider)
);

-- US3: the text the phone made from a voice recording, as the listener corrected it.
-- It goes with its row: the voice post's 24 h expiry, or the comment's delete / removal.
ALTER TABLE voice_posts ADD COLUMN transcript text NULL CHECK (char_length(transcript) <= 2000);
ALTER TABLE comments    ADD COLUMN transcript text NULL CHECK (char_length(transcript) <= 2000);

-- US9: one image per comment. Written only after gate G1 names the store (constitution v3.2.0);
-- until then every column stays NULL. Deleting or removing the comment deletes the object.
ALTER TABLE comments ADD COLUMN image_url   text     NULL CHECK (image_url IS NULL OR image_url LIKE 'https://%');
ALTER TABLE comments ADD COLUMN image_path  text     NULL;
ALTER TABLE comments ADD COLUMN image_w     smallint NULL CHECK (image_w IS NULL OR image_w > 0);
ALTER TABLE comments ADD COLUMN image_h     smallint NULL CHECK (image_h IS NULL OR image_h > 0);
ALTER TABLE comments ADD COLUMN image_bytes int      NULL CHECK (image_bytes IS NULL OR image_bytes BETWEEN 1 AND 1000000);

-- US6: Google Play. purchase_token is the idempotency key (a repeat grants once, G-M20-5);
-- ref = the show's feed URL for show_tier_*; acknowledged_at within 3 days or Google refunds;
-- voided_at from the Voided Purchases API (refund → status 'refunded', entitlement removed).
ALTER TABLE purchases ADD COLUMN purchase_token  text        NULL UNIQUE;
ALTER TABLE purchases ADD COLUMN ref             text        NULL;
ALTER TABLE purchases ADD COLUMN acknowledged_at timestamptz NULL;
ALTER TABLE purchases ADD COLUMN voided_at       timestamptz NULL;

-- US6: paid episodes, only on shows created in the Studio (external RSS audio is public).
-- created_at stays NULL for every episode that existed before M20, and only an episode with a
-- created_at can be made paid: nothing free before 2026-10-05 becomes paid (FR-024, G-M20-6).
ALTER TABLE hosted_shows    ADD COLUMN price_tier smallint NULL CHECK (price_tier BETWEEN 1 AND 5);
ALTER TABLE hosted_episodes ADD COLUMN paid       boolean     NOT NULL DEFAULT false;
ALTER TABLE hosted_episodes ADD COLUMN created_at timestamptz NULL;
ALTER TABLE hosted_episodes ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE hosted_episodes ADD CONSTRAINT hosted_episodes_paid_is_new CHECK (NOT paid OR created_at IS NOT NULL);
