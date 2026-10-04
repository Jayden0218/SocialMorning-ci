-- Chat (owner, 2026-10-04): one-to-one messages between two listeners who follow each other.
-- A message is text (≤ 1000 characters), an episode card, or both. Nothing else: no audio, no
-- pictures — we never host media. Deleted with either account (ON DELETE CASCADE).
-- `read_at` is set when the recipient opens the conversation; it drives the unread badge.
CREATE TABLE chat_messages (
  id           bigserial   PRIMARY KEY,
  sender_id    uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  recipient_id uuid        NOT NULL REFERENCES listeners(id) ON DELETE CASCADE,
  body         text        NOT NULL DEFAULT '' CHECK (char_length(body) <= 1000),
  episode_id   text        NULL REFERENCES episodes(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz NULL,
  CHECK (sender_id <> recipient_id),
  CHECK (body <> '' OR episode_id IS NOT NULL)
);
CREATE INDEX chat_messages_pair ON chat_messages (sender_id, recipient_id, id);
CREATE INDEX chat_messages_unread ON chat_messages (recipient_id, sender_id) WHERE read_at IS NULL;
