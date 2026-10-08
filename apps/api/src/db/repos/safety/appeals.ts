// Appeals: what a listener may appeal, sending one appeal per action, and the admin's decision.
/**
 * M24 US6. An appeal is about one moderation action against the listener — their suspension, or
 * the removal of something they posted — from the last APPEAL_DAYS days. One per action (the
 * UNIQUE key on `appeals.action_id`). Accepting undoes the action; rejecting leaves it.
 * Either way the listener gets a system notice.
 */
import type { Action, TargetKind } from '@socialmorning/social-core';
import type { Db } from '../../db.ts';
import { insertNotice } from '../social/system-notices.ts';

export const APPEAL_DAYS = 90;
export const APPEAL_TEXT_MAX = 1000;

export type Appealable = {
  actionId: string; action: Action; targetKind: TargetKind; targetId: string; at: string;
  /** What was acted on, from the copy a report kept (a removed item is no longer readable). */
  what: string;
  appeal: { id: string; state: 'open' | 'accepted' | 'rejected'; createdAt: string } | null;
};

type Row = {
  id: string; action: Action; target_kind: TargetKind; target_id: string; created_at: Date | string; snapshot: unknown;
  appeal_id: string | null; appeal_state: 'open' | 'accepted' | 'rejected' | null; appeal_at: Date | string | null;
};

const obj = (v: unknown): Record<string, unknown> => {
  const x = typeof v === 'string' ? (JSON.parse(v) as unknown) : v;
  return x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
};

/** One line saying what an action was about, from its report's copy. */
export function describe(kind: TargetKind, action: Action, snapshot: unknown): string {
  if (action === 'suspend') return 'Your account was suspended';
  const s = obj(snapshot);
  const text = [s['body'], s['caption'], s['title'], s['voiceText']].find((v): v is string => typeof v === 'string' && v !== '');
  const thing = kind === 'chat_message' ? 'message' : kind === 'list' ? 'shared list' : kind;
  return text ? `Your ${thing} “${text.length > 80 ? `${text.slice(0, 80)}…` : text}” was removed` : `Your ${thing} was removed`;
}

/**
 * The actions against this listener they may appeal: a `remove` of something they wrote, or a
 * `suspend` while they are still suspended — newest first, each with its appeal if one was sent.
 */
export async function appealableFor(db: Db, listenerId: string): Promise<Appealable[]> {
  const rows = await db.query<Row>(
    `SELECT a.id, a.action, a.target_kind, a.target_id, a.created_at,
            (SELECT r.snapshot FROM reports r WHERE r.closed_by = a.id ORDER BY r.created_at LIMIT 1) AS snapshot,
            ap.id AS appeal_id, ap.state AS appeal_state, ap.created_at AS appeal_at
       FROM moderation_actions a
       LEFT JOIN appeals ap ON ap.action_id = a.id
      WHERE a.created_at > now() - make_interval(days => $2::int)
        AND (
          (a.action = 'remove' AND EXISTS (SELECT 1 FROM reports r WHERE r.closed_by = a.id AND r.snapshot->>'authorId' = $1::text))
          OR (a.action = 'suspend'
              AND EXISTS (SELECT 1 FROM listeners l WHERE l.id = $1::uuid AND l.suspended_at IS NOT NULL)
              AND ((a.target_kind = 'profile' AND a.target_id = $1::text)
                   OR EXISTS (SELECT 1 FROM reports r WHERE r.closed_by = a.id AND r.snapshot->>'authorId' = $1::text)))
        )
      ORDER BY a.created_at DESC LIMIT 50`,
    [listenerId, APPEAL_DAYS],
  );
  return rows.map((r) => ({
    actionId: r.id, action: r.action, targetKind: r.target_kind, targetId: r.target_id, at: new Date(r.created_at).toISOString(),
    what: describe(r.target_kind, r.action, r.snapshot),
    appeal: r.appeal_id ? { id: r.appeal_id, state: r.appeal_state!, createdAt: new Date(r.appeal_at!).toISOString() } : null,
  }));
}

/** Sends the appeal. `'not_appealable'` when the action is not theirs to appeal; `'already'` when sent before. */
export async function sendAppeal(db: Db, listenerId: string, actionId: string, text: string): Promise<{ id: string } | 'not_appealable' | 'already'> {
  const item = (await appealableFor(db, listenerId)).find((a) => a.actionId === actionId);
  if (!item) return 'not_appealable';
  if (item.appeal) return 'already';
  const rows = await db.query<{ id: string }>(
    'INSERT INTO appeals (listener_id, action_id, text) VALUES ($1, $2, $3) ON CONFLICT (action_id) DO NOTHING RETURNING id', [listenerId, actionId, text]);
  return rows[0] ? { id: rows[0].id } : 'already';
}

export type AdminAppeal = {
  id: string; state: 'open' | 'accepted' | 'rejected'; text: string; createdAt: string; decidedAt: string | null;
  listener: { id: string; displayName: string; email: string; suspended: boolean };
  action: { id: string; action: Action; targetKind: TargetKind; targetId: string; at: string };
  what: string; snapshot: Record<string, unknown>;
};

export async function adminAppeals(db: Db, state: 'open' | 'decided'): Promise<AdminAppeal[]> {
  const rows = await db.query<{
    id: string; state: AdminAppeal['state']; text: string; created_at: Date | string; decided_at: Date | string | null;
    listener_id: string; display_name: string; email: string; suspended_at: string | null;
    action_id: string; action: Action; target_kind: TargetKind; target_id: string; action_at: Date | string; snapshot: unknown;
  }>(
    `SELECT ap.id, ap.state, ap.text, ap.created_at, ap.decided_at, l.id AS listener_id, l.display_name, l.email::text AS email, l.suspended_at,
            a.id AS action_id, a.action, a.target_kind, a.target_id, a.created_at AS action_at,
            (SELECT r.snapshot FROM reports r WHERE r.closed_by = a.id ORDER BY r.created_at LIMIT 1) AS snapshot
       FROM appeals ap JOIN listeners l ON l.id = ap.listener_id JOIN moderation_actions a ON a.id = ap.action_id
      WHERE ($1::text = 'open') = (ap.state = 'open')
      ORDER BY CASE WHEN ap.state = 'open' THEN ap.created_at END ASC, ap.decided_at DESC NULLS LAST LIMIT 200`, [state]);
  return rows.map((r) => ({
    id: r.id, state: r.state, text: r.text, createdAt: new Date(r.created_at).toISOString(), decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
    listener: { id: r.listener_id, displayName: r.display_name, email: r.email, suspended: r.suspended_at !== null },
    action: { id: r.action_id, action: r.action, targetKind: r.target_kind, targetId: r.target_id, at: new Date(r.action_at).toISOString() },
    what: describe(r.target_kind, r.action, r.snapshot), snapshot: obj(r.snapshot),
  }));
}

export async function appealById(db: Db, id: string): Promise<{ id: string; state: string; listener_id: string; action_id: string; action: Action; target_kind: TargetKind; target_id: string } | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const [r] = await db.query<{ id: string; state: string; listener_id: string; action_id: string; action: Action; target_kind: TargetKind; target_id: string }>(
    `SELECT ap.id, ap.state, ap.listener_id, a.id AS action_id, a.action, a.target_kind, a.target_id
       FROM appeals ap JOIN moderation_actions a ON a.id = ap.action_id WHERE ap.id = $1`, [id]);
  return r;
}

/**
 * Undoes a removal: the item comes back for every reader. A status comes back only while its
 * 24 hours last (after that the sweep has deleted it from storage, as the constitution asks).
 * A suspension is undone by the caller through `act('unsuspend')`, the one place for that rule.
 */
export async function restoreRemoved(db: Db, kind: TargetKind, id: string): Promise<void> {
  if (kind === 'comment') await db.query('UPDATE comments SET removed_at = NULL WHERE id = $1', [id]);
  else if (kind === 'clip') await db.query('UPDATE clips SET removed_at = NULL WHERE id = $1', [id]);
  else if (kind === 'status') await db.query("UPDATE voice_posts SET expires_at = created_at + interval '24 hours' WHERE id = $1 AND created_at + interval '24 hours' > now()", [id]);
  else if (kind === 'chat_message') await db.query('UPDATE chat_messages SET removed_at = NULL WHERE id = $1::bigint', [id]);
  else if (kind === 'list') await db.query('UPDATE shared_lists SET removed_at = NULL WHERE id = $1', [id]);
}

/** Marks the decision and tells the listener. */
export async function decide(db: Db, appealId: string, listenerId: string, accepted: boolean, by: string): Promise<void> {
  await db.query("UPDATE appeals SET state = $2, decided_at = now(), decided_by = $3 WHERE id = $1 AND state = 'open'", [appealId, accepted ? 'accepted' : 'rejected', by]);
  await insertNotice(db, accepted
    ? { listenerId, title: 'Your appeal was accepted', body: 'We looked again and undid what we did. Thank you for telling us.' }
    : { listenerId, title: 'Your appeal was not accepted', body: 'We looked again and the decision stands. You can read the community rules in Settings.' });
}
