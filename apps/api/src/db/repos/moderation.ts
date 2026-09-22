/**
 * M6 moderation actions (FR-012–FR-016, R8): one transaction records the action, closes
 * the target's open reports, and applies the effect. Only the owner reaches this (G9,
 * checked in the page).
 */
import type { Action, TargetKind } from '@socialmorning/social-core';
import type { Db } from '../db.ts';
import { closeReportsFor } from './reports.ts';

export type ActionRow = { id: string; actor_id: string; action: Action; target_kind: TargetKind; target_id: string; created_at: string };

export async function act(db: Db, actorId: string, item: { kind: TargetKind; id: string }, action: Action): Promise<ActionRow> {
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
        }
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

async function authorOf(db: Db, kind: TargetKind, id: string): Promise<string | null> {
  const table = kind === 'comment' ? 'comments' : kind === 'clip' ? 'clips' : null;
  if (!table) return null;
  const [r] = await db.query<{ author_id: string | null }>(`SELECT author_id FROM ${table} WHERE id = $1`, [id]);
  return r?.author_id ?? null;
}

export async function hiddenFeedUrls(db: Db): Promise<Set<string>> {
  const rows = await db.query<{ feed_url: string }>('SELECT feed_url FROM hidden_feeds');
  return new Set(rows.map((r) => r.feed_url));
}

export async function recentActions(db: Db, limit = 100): Promise<(ActionRow & { actor_name: string })[]> {
  return db.query(
    'SELECT a.id, a.actor_id, l.display_name AS actor_name, a.action, a.target_kind, a.target_id, a.created_at FROM moderation_actions a JOIN listeners l ON l.id = a.actor_id ORDER BY a.created_at DESC LIMIT $1',
    [limit],
  );
}

export async function isSuspended(db: Db, listenerId: string): Promise<boolean> {
  const [r] = await db.query<{ suspended_at: string | null }>('SELECT suspended_at FROM listeners WHERE id = $1', [listenerId]);
  return r?.suspended_at != null;
}
