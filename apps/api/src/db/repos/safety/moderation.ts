// Applies a moderation action, closes its reports and records it, in one step.
/**
 * M6 moderation actions (FR-012–FR-016, R8): one transaction records the action, closes
 * the target's open reports, and applies the effect. Only the owner reaches this (G9,
 * checked in the page).
 */
import type { Action, TargetKind } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';
import { closeReportsFor } from './reports.ts';
import { insertNotice } from '../social/system-notices.ts';

export type ActionRow = { id: string; actor_id: string; action: Action; target_kind: TargetKind; target_id: string; created_at: string };

async function actPg(db: Db, actorId: string, item: { kind: TargetKind; id: string }, action: Action): Promise<ActionRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx.query<ActionRow>(
      'INSERT INTO moderation_actions (actor_id, action, target_kind, target_id) VALUES ($1, $2, $3, $4) RETURNING id, actor_id, action, target_kind, target_id, created_at',
      [actorId, action, item.kind, item.id],
    );
    const a = row!;
    switch (action) {
      case 'remove':
        if (item.kind === 'comment') {
          await tx.query('UPDATE comments SET removed_at = now() WHERE id = $1 AND removed_at IS NULL', [item.id]);
          await tx.query(`DELETE FROM activity WHERE kind = 'commented' AND ref_id = $1`, [item.id]);
        } else if (item.kind === 'clip') {
          await tx.query('UPDATE clips SET removed_at = now() WHERE id = $1 AND removed_at IS NULL', [item.id]);
          await tx.query(`DELETE FROM activity WHERE kind = 'clipped' AND ref_id = $1`, [item.id]);
        } else if (item.kind === 'status') {
          // M24 US1: the status ends now — every reader asks `expires_at > now()`, and the hourly
          // sweep deletes its recording, replies and photos from storage (constitution V).
          await tx.query('UPDATE voice_posts SET expires_at = now() WHERE id = $1 AND expires_at > now()', [item.id]);
        } else if (item.kind === 'chat_message') {
          await tx.query('UPDATE chat_messages SET removed_at = now() WHERE id = $1::bigint AND removed_at IS NULL', [item.id]);
        } else if (item.kind === 'list') {
          await tx.query('UPDATE shared_lists SET removed_at = now() WHERE id = $1 AND removed_at IS NULL', [item.id]);
        }
        // M24 US6: the author is told, with the one way to appeal.
        await tellAuthor(tx, item);
        break;
      case 'hide_show':
        await tx.query('INSERT INTO hidden_feeds (feed_url, action_id) VALUES ($1, $2) ON CONFLICT (feed_url) DO NOTHING', [item.id, a.id]);
        break;
      case 'unhide_show':
        await tx.query('DELETE FROM hidden_feeds WHERE feed_url = $1', [item.id]);
        break;
      case 'suspend': {
        const who = item.kind === 'profile' ? item.id : await authorOf(tx, item.kind, item.id);
        // Sessions stay as rows: every request on them answers 403 `suspended` with the appeals
        // address (session.ts), which a bare 401 could not carry. Un-suspend brings them back.
        if (who) await tx.query('UPDATE listeners SET suspended_at = now() WHERE id = $1 AND suspended_at IS NULL', [who]);
        break;
      }
      case 'unsuspend':
        await tx.query('UPDATE listeners SET suspended_at = NULL WHERE id = $1', [item.id]);
        break;
      case 'dismiss':
        break;
    }
    await closeReportsFor(tx, item.kind, item.id, a.id, action);
    return a;
  });
}

/** Who wrote the item: from its row while it exists, else from the copy a report kept (M24: a status may be swept). */
async function authorOfPg(db: Db, kind: TargetKind, id: string): Promise<string | null> {
  const sql = kind === 'comment' ? 'SELECT author_id FROM comments WHERE id = $1'
    : kind === 'clip' ? 'SELECT author_id FROM clips WHERE id = $1'
    : kind === 'status' && /^[0-9a-f-]{36}$/i.test(id) ? 'SELECT listener_id AS author_id FROM voice_posts WHERE id = $1'
    : kind === 'chat_message' && /^\d{1,18}$/.test(id) ? 'SELECT sender_id AS author_id FROM chat_messages WHERE id = $1::bigint'
    : kind === 'list' ? 'SELECT owner_id AS author_id FROM shared_lists WHERE id = $1'
    : null;
  if (sql) {
    const [r] = await db.query<{ author_id: string | null }>(sql, [id]);
    if (r?.author_id) return r.author_id;
  }
  const [s] = await db.query<{ author_id: string | null }>(
    "SELECT snapshot->>'authorId' AS author_id FROM reports WHERE target_kind = $1 AND target_id = $2 AND snapshot ? 'authorId' ORDER BY created_at LIMIT 1", [kind, id]);
  return s?.author_id && /^[0-9a-f-]{36}$/i.test(s.author_id) ? s.author_id : null;
}

const THING: Partial<Record<TargetKind, string>> = { comment: 'comment', clip: 'clip', status: 'status', chat_message: 'message', list: 'shared list' };

/** M24 US6: a system notice to the author of removed content, with the Appeal button. */
async function tellAuthor(db: Db, item: { kind: TargetKind; id: string }): Promise<void> {
  const who = await authorOf(db, item.kind, item.id);
  const thing = THING[item.kind];
  if (!who || !thing) return;
  await insertNotice(db, {
    listenerId: who, title: `Your ${thing} was removed`,
    body: `A ${thing} you posted broke the community rules, so it was removed. If you think this is a mistake, you can appeal once.`,
    link: { label: 'Appeal', route: '/appeal' },
  });
}

async function hiddenFeedUrlsPg(db: Db): Promise<Set<string>> {
  // M23 US11: plus shows whose own feed says `itunes:block` (catalog/feed.ts setPublisherBlock).
  const rows = await db.query<{ feed_url: string }>("SELECT feed_url FROM hidden_feeds UNION SELECT substr(key, 12) FROM cache WHERE key LIKE 'feed-block:%'");
  return new Set(rows.map((r) => r.feed_url));
}

async function recentActionsPg(db: Db, limit = 100): Promise<(ActionRow & { actor_name: string })[]> {
  return db.query(
    'SELECT a.id, a.actor_id, l.display_name AS actor_name, a.action, a.target_kind, a.target_id, a.created_at FROM moderation_actions a JOIN listeners l ON l.id = a.actor_id ORDER BY a.created_at DESC LIMIT $1',
    [limit],
  );
}

/** M23 US11: on Postgres the publisher's mark is the `feed-block:` cache row (catalog/feed.ts), which hiddenFeedUrls reads. */
async function setPublisherMarkPg(_db: Db, _feedUrl: string, _blocked: boolean): Promise<void> {}

// M26 lane SF: each runs on Postgres, or on DynamoDB (ddb/moderation.ts) when the Db carries a Store (db/backend.ts).
export const act = dual('sf/moderation', 'act', actPg);
export const authorOf = dual('sf/moderation', 'authorOf', authorOfPg);
export const hiddenFeedUrls = dual('sf/moderation', 'hiddenFeedUrls', hiddenFeedUrlsPg);
export const recentActions = dual('sf/moderation', 'recentActions', recentActionsPg);
export const setPublisherMark = dual('sf/moderation', 'setPublisherMark', setPublisherMarkPg);
