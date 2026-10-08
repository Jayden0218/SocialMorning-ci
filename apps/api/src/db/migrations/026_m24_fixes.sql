-- M24 fixes, lane F-S (spec 025, "Fixes F-S"): three schema changes, no new table.

-- 1. System notices get their own push switch (was "Popular content"). Default on, like the others.
ALTER TABLE push_prefs ADD COLUMN IF NOT EXISTS system boolean NOT NULL DEFAULT true;

-- 2. PLUS from a redeem code lives in its own entitlements row (ref 'code'), apart from the store's
-- row (ref ''), so a Google Play renewal or refund never overwrites or removes code days. Before
-- this, a redeem with no store purchase wrote ref '' with no source purchase: move those rows.
-- (A row a code had stretched on top of a store purchase cannot be split; it stays the store's.)
UPDATE entitlements e SET ref = 'code'
 WHERE e.kind = 'plus' AND e.ref = '' AND e.source_purchase_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM entitlements x WHERE x.listener_id = e.listener_id AND x.kind = 'plus' AND x.ref = 'code');

-- 4. A comment held for review may carry a picture (same columns as comments, migration 018).
-- Approve copies them into `comments`; Reject deletes the file from the image store.
ALTER TABLE held_comments ADD COLUMN IF NOT EXISTS image_url   text     NULL CHECK (image_url IS NULL OR image_url LIKE 'https://%');
ALTER TABLE held_comments ADD COLUMN IF NOT EXISTS image_path  text     NULL;
ALTER TABLE held_comments ADD COLUMN IF NOT EXISTS image_w     smallint NULL CHECK (image_w IS NULL OR image_w > 0);
ALTER TABLE held_comments ADD COLUMN IF NOT EXISTS image_h     smallint NULL CHECK (image_h IS NULL OR image_h > 0);
ALTER TABLE held_comments ADD COLUMN IF NOT EXISTS image_bytes int      NULL CHECK (image_bytes IS NULL OR image_bytes BETWEEN 1 AND 1000000);
