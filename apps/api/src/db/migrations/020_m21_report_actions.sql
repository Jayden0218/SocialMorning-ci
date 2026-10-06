-- M21 US2: the owner can dismiss an episode or transcript report in /mod. Migration 019 widened
-- reports.target_kind; the action that closes a report is recorded in moderation_actions,
-- whose own CHECK still held the four M6 kinds, so a Dismiss there failed.
ALTER TABLE moderation_actions DROP CONSTRAINT moderation_actions_target_kind_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_target_kind_check
  CHECK (target_kind IN ('comment','clip','profile','show','episode','transcript'));
