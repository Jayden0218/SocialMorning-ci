-- M25 lane AC (spec 026, A7 + A8): app settings an admin may change, and editable content pages.

-- A7. One JSON value per setting. The shape of each key is checked by the server before a save
-- (packages/social-core/src/app-config.ts); a key with no row is at its default, which is today's app.
CREATE TABLE IF NOT EXISTS app_config (
  key        text        PRIMARY KEY CHECK (key IN ('shortcuts', 'genres', 'sectionTitles', 'listSizes', 'ratePrompt', 'searchHints')),
  value      jsonb       NOT NULL,
  version    int         NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A8. Academy articles and Help questions. `body` is the Markdown subset (social-core markdown.ts),
-- drawn as text by the Studio and the phone, never as HTML. Academy: `summary` is the card line,
-- `tag` the tab (start | grow | community). Help: `title` is the question, `tag` its chip.
CREATE TABLE IF NOT EXISTS content_pages (
  kind       text        NOT NULL CHECK (kind IN ('academy', 'faq')),
  slug       text        NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  title      text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  summary    text        NULL CHECK (summary IS NULL OR char_length(summary) <= 200),
  tag        text        NULL CHECK (tag IS NULL OR char_length(tag) <= 40),
  body       text        NOT NULL CHECK (char_length(body) <= 8000),
  position   int         NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 1000),
  published  boolean     NOT NULL DEFAULT true,
  version    int         NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, slug)
);
CREATE INDEX IF NOT EXISTS content_pages_order ON content_pages (kind, position, slug);

-- Seeded from the phone's bundled copy (apps/mobile/src/settings/academy.ts, faq.ts), so the phone
-- shows the same words from the server as it does offline. "The steps" becomes a real numbered list.
INSERT INTO content_pages (kind, slug, title, summary, tag, body, position) VALUES
  ('academy', 'claim-your-show', 'Claim your show', 'Prove the feed is yours, without handing it over.', 'start', '## Why claim

A claimed show gets its numbers in the Creator centre, a Host mark on your comments, and the Studio website. Your audio stays where it is: SocialNet reads your RSS feed and never hosts your episodes.

## The steps

1. Me › Creator centre.
2. Pick your show from the list, or paste your feed address.
3. Tap Get my code.
4. Put the code anywhere in your show description, in your hosting service.
5. Wait for your host to update the feed, then tap Verify.

## After it is proven

You can take the code out of your description again. The claim stays.', 0),
  ('academy', 'read-your-numbers', 'Read your numbers', 'What "listened", comments and moments mean.', 'grow', '## In the app

Creator centre shows, for each proven show, how many people listened, how many comments it has, how many episodes, and the moments where people comment most.

## What counts

A listener counts once per episode, and only when their listening is public. Deleted and removed comments are not counted. Nobody''s private listening is ever shown to you.

## More detail

The Studio website (https://socialmorning-studio.vercel.app) shows the same numbers over time, per episode, and your subscribers.', 1),
  ('academy', 'reply-to-comments', 'Talk with your listeners', 'Comments are pinned to moments — answer them there.', 'community', '## Moments

Listeners comment at a point in the episode. On the episode page, "By moment" lists comments in the order they happen, so you can follow the conversation as the episode plays.

## Your Host mark

Once your show is proven, every comment you write on it carries a Host mark, so listeners know the answer is yours.

## Keeping it kind

You can hide a comment on your own show from the Studio. Listeners can report anything that breaks the rules; moderation reviews every report.', 2),
  ('academy', 'clips', 'Clips', 'Share the best minute without copying a second of audio.', 'grow', '## What a clip is

A clip is a start time and an end time in your episode. No audio is copied: whoever opens it plays that part from your own feed.

## Making one

In the player, tap the scissors: it takes the last 30 seconds. Change the start and end if you like, and share the link. Anyone can do this with any episode.

## Why it helps you

A clip plays from your own feed and links back to the episode, so a listener who likes the minute is one tap from the whole show.', 3),
  ('academy', 'the-studio', 'The Studio', 'Your show''s page, announcements and polls, on the web.', 'start', '## Signing in

Open https://socialmorning-studio.vercel.app on a computer and sign in with your SocialNet account.

## Your show page

Change the title, description and cover SocialNet shows, name your hosts, and add links and contacts. The feed itself is not changed.

## Announcements and polls

Post a note to your listeners or ask a question. They appear on your show page in the app, marked as from the host.', 4),
  ('faq', 'where-does-the-audio-come-from', 'Where does the audio come from?', NULL, 'Listening', 'Every episode plays straight from its publisher. SocialNet never stores or hosts audio.', 0),
  ('faq', 'how-do-timestamped-comments-work', 'How do timestamped comments work?', NULL, 'Comments', 'A comment is pinned to the moment you were at when you wrote it. Others see it when they reach that moment, and on the heat curve above the scrubber.', 1),
  ('faq', 'why-is-an-episode-not-downloading', 'Why is an episode not downloading?', NULL, 'Downloads', 'Check the storage budget and “Allow mobile data” under Settings › Downloads and cache. A download waits for Wi-Fi unless mobile data is allowed.', 2),
  ('faq', 'how-do-i-move-my-shows-from-another-app', 'How do I move my shows from another app?', NULL, 'Subscriptions', 'Export an OPML file from the other app, then open Settings › More › Import or export subscriptions and paste it in.', 3),
  ('faq', 'how-do-stickers-work', 'How do stickers work?', NULL, 'Stickers', 'Stickers are earned for listening milestones — your first hour, 10 hours, your first finished episode, and more. See Me › Stickers.', 4),
  ('faq', 'who-can-see-what-i-listen-to', 'Who can see what I listen to?', NULL, 'Privacy', 'Turn on “Keep my listening private” under Settings › Privacy, and your listens and stats are hidden from others. Comments and clips stay public.', 5),
  ('faq', 'how-do-i-block-or-report-someone', 'How do I block or report someone?', NULL, 'Safety', 'Open their profile or the comment and choose Block or Report. Manage blocked listeners under Settings › Privacy › Blocked listeners.', 6),
  ('faq', 'how-do-i-delete-my-account', 'How do I delete my account?', NULL, 'Account', 'Settings › Account and security › Delete my account. We send a code to your email to confirm.', 7),
  ('faq', 'community-guidelines', 'Community guidelines', NULL, 'Community', 'Be respectful, talk about the issue and not the person, no illegal content, harassment or spam. The full text is under Settings › About.', 8)
ON CONFLICT (kind, slug) DO NOTHING;

-- The admin record takes the two new areas. Read the current list and add to it, so this migration
-- keeps any area another M25 migration (027, 028) added before it.
DO $$
DECLARE
  areas text[];
BEGIN
  SELECT array_agg(DISTINCT m[1]) INTO areas
    FROM pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
   WHERE c.conname = 'admin_audit_area_check';
  areas := array(SELECT DISTINCT x FROM unnest(coalesce(areas, ARRAY[]::text[]) || ARRAY['config', 'content']) AS x ORDER BY 1);
  ALTER TABLE admin_audit DROP CONSTRAINT IF EXISTS admin_audit_area_check;
  EXECUTE format('ALTER TABLE admin_audit ADD CONSTRAINT admin_audit_area_check CHECK (area = ANY (%L::text[]))', areas);
END
$$;
