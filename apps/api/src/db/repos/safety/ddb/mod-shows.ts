// The /mod page's Studio shows list and take-down on DynamoDB: the Studio rows are the Studio's, the hide and the action are items here.
/**
 * The hosted shows and their episodes and claims are the Studio's (foreign.ts); the owner's name is the listener
 * item; "hidden" is the hidden-feeds partition; the take-down's moderation action is an `MA#` item like act()'s
 * (G4 `Q#actions`, the hour's `R#dash#actions`).
 */
import { randomUUID } from 'node:crypto';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { tx } from '../../../ddb/tx.ts';
import type { CreatedShowRow } from '../mod-shows.ts';
import { dashAdd } from './dash.ts';
import { liveHostedShows, takedownStudio } from './foreign.ts';
import { listenersById, nowIso, type Db, type Store } from './common.ts';

export async function studioCreatedShows(store: Store, db: Db): Promise<CreatedShowRow[]> {
  const rows = await liveHostedShows(store, db);
  const owners = await listenersById(store, rows.map((r) => r.owner_id ?? ''));
  const hidden = new Set((await batchGetAll(store, 'main', [...new Set(rows.map((r) => r.feed_url))].map((u) => K.hiddenFeed(u)))).map((i) => String(i['feedUrl'])));
  return rows.map((r) => ({
    id: r.id, title: r.title, feed_url: r.feed_url, owner: r.owner_id ? ((owners.get(r.owner_id)?.['displayName'] as string | undefined) ?? null) : null,
    created_at: r.created_at, updated_at: r.updated_at, eps: Number(r.eps), hidden: hidden.has(r.feed_url),
  }));
}

/** The rest of a take-down: its episodes go, its proven claims are revoked, and the hide is recorded. */
export async function finishTakedown(store: Store, db: Db, showId: string, feedUrl: string, actorId: string): Promise<void> {
  const id = randomUUID();
  const at = nowIso(store);
  const t = tx(store).put('main', encode('moderationAction', K.moderationAction(id), {
    id, actorId, action: 'hide_show', targetKind: 'show', targetId: feedUrl, subjectListenerId: null, reportAuthorId: null, snapshot: null, createdAt: at,
  }, { gsi: K.G4('actions', at, id) }), { condition: 'attribute_not_exists(PK)' });
  dashAdd(t, 'actions', at);
  await takedownStudio(store, db, showId, feedUrl);
  await t.commit();
}
