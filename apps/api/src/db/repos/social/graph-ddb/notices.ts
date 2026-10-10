// System notices and host notices on DynamoDB: notices to everyone or to one listener, and the announcements of the shows I follow.
/**
 * M26 lane SG, SG-T05 (patterns SG-25…SG-30), data-model.md "Lane SG changes".
 *
 * - System notices: `SN#ALL` (to everyone) or `SN#<listenerId>` (to one), sorted `<createdAt>#<id>`. A listener's list
 *   is two Queries merged (newest first, 50); Admin's list is `SN#ALL` (100). Delete finds the id in `SN#ALL` only,
 *   as the SQL's `listener_id IS NULL` did. The push goes to the tokens lane AC holds (`systemPushTokens`).
 * - Host notices: read-merge, not fan-out. The listener's live subscriptions (lane LB's items) select the shows; their
 *   released announcements and the listener's subscriber milestones are lane ST's rows, still on Postgres, read with
 *   the old SQL restricted to those feeds; the show title and cover are the show's META (lane LB). Fan-out at release
 *   time (an EventBridge or `Q#scheduled` timer) belongs with lane ST's announcements when they move.
 */
import { randomUUID } from 'node:crypto';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { put, del, type Item } from '../../../ddb/store.ts';
import { sendExpo } from '../../account/push.ts';
import { systemPushTokens } from '../../account/ddb/push.ts';
import { subscriptionItems } from '../../library/ddb/subscriptions.ts';
import { imagesOf } from '../../studio/announcements.ts';
import { NOTICE_BODY_MAX, NOTICE_TITLE_MAX, NOTICES_HREF, NOTICES_PAGE, type NoticeIn, type NoticeOut } from '../system-notices.ts';
import { NOTICES_PAGE as HOST_PAGE, type HostNotice } from '../host-notices.ts';
import type { PushMessage } from '../../account/push.ts';
import { iso, nowMs, pgRaw, showsByUrl, str, type Hybrid } from './common.ts';

const toOut = (r: Item): NoticeOut => ({
  id: String(r['id']), title: String(r['title']), body: String(r['body']), createdAt: String(r['createdAt']),
  ...(r['linkLabel'] && r['linkRoute'] ? { action: { label: String(r['linkLabel']), route: String(r['linkRoute']) } } : {}),
  to: r['listenerId'] === null || r['listenerId'] === undefined ? 'everyone' : 'you', push: r['push'] === true,
});

/** The old ORDER BY created_at DESC, id. */
const order = (a: Item, b: Item): number =>
  String(a['createdAt']) !== String(b['createdAt']) ? String(b['createdAt']).localeCompare(String(a['createdAt'])) : String(a['id']).localeCompare(String(b['id']));

async function partition(h: Hybrid, who: string, max: number): Promise<Item[]> {
  return (await queryAll(h.store, 'main', { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `SN#${who}` }, ScanIndexForward: false, ConsistentRead: true }, { max })).items;
}


export async function insertNotice(h: Hybrid, n: NoticeIn): Promise<NoticeOut> {
  const id = randomUUID();
  const createdAt = iso(nowMs(h));
  const listenerId = n.listenerId ?? null;
  const item = encode('systemNotice', K.systemNotice(listenerId, createdAt, id), {
    id, listenerId, title: n.title.slice(0, NOTICE_TITLE_MAX), body: n.body.slice(0, NOTICE_BODY_MAX), linkLabel: n.link?.label ?? null, linkRoute: n.link?.route ?? null,
    push: n.push === true, createdBy: n.createdBy ?? null, createdAt,
  });
  await put(h.store, 'main', item, { condition: 'attribute_not_exists(PK)' });
  return toOut(item);
}

/** What one listener sees: notices to everyone and to them, newest first. */
export async function noticesFor(h: Hybrid, listenerId: string): Promise<NoticeOut[]> {
  const [all, mine] = await Promise.all([partition(h, 'ALL', NOTICES_PAGE), partition(h, listenerId, NOTICES_PAGE)]);
  return [...all, ...mine].sort(order).slice(0, NOTICES_PAGE).map(toOut);
}

/** Admin's list: the notices sent to everyone (account notices to one listener stay private). */
export async function broadcastNotices(h: Hybrid): Promise<NoticeOut[]> {
  return (await partition(h, 'ALL', 100)).sort(order).map(toOut);
}

export async function deleteNotice(h: Hybrid, id: string): Promise<boolean> {
  const { items } = await queryAll(h.store, 'main', {
    KeyConditionExpression: 'PK = :pk', FilterExpression: '#i = :id', ExpressionAttributeNames: { '#i': 'id' }, ExpressionAttributeValues: { ':pk': 'SN#ALL', ':id': id }, ConsistentRead: true,
  }, { max: 1 });
  const hit = items[0];
  if (!hit) return false;
  await del(h.store, 'main', { PK: String(hit['PK']), SK: String(hit['SK']) });
  return true;
}

/** Pushes a notice to its listener (or everyone) whose "System notices" switch is on. */
export async function pushNotice(h: Hybrid, f: typeof fetch, n: { title: string; body: string; listenerId: string | null }): Promise<{ sent: number; dropped: number }> {
  const tokens = await systemPushTokens(h, n.listenerId);
  const messages = tokens.map((to): PushMessage => ({ to, title: n.title, body: n.body.slice(0, 180), data: { href: NOTICES_HREF, kind: 'system' }, sound: 'default' }));
  return messages.length === 0 ? { sent: 0, dropped: 0 } : sendExpo(h.pg, f, messages);
}

// ---- host notices (M19 US10, M24 US12) ----

export async function hostNotices(h: Hybrid, listenerId: string, before: string | undefined): Promise<{ items: HostNotice[]; next?: string }> {
  const feeds = (await subscriptionItems(h.store, listenerId)).filter((s) => !s['deletedAt']).map((s) => String(s['feedUrl']));
  const cut = before !== undefined && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : null;
  const rows = await pgRaw(h).query<{ id: string; feed_url: string; body: string; images: unknown; release_at: Date | string }>(
    `SELECT * FROM (
       SELECT a.id::text AS id, a.feed_url, a.body, a.images, a.release_at FROM announcements a
        WHERE a.feed_url = ANY($2::text[]) AND a.deleted_at IS NULL AND a.release_at <= now()
       UNION ALL
       SELECT m.id::text, m.feed_url, m.body, '[]'::jsonb, m.sent_at FROM milestones_sent m WHERE m.listener_id = $1
     ) x WHERE ($3::timestamptz IS NULL OR x.release_at < $3::timestamptz)
       AND NOT EXISTS (SELECT 1 FROM hidden_feeds hf WHERE hf.feed_url = x.feed_url)
     ORDER BY x.release_at DESC LIMIT ${HOST_PAGE + 1}`,
    [listenerId, feeds, cut]);
  const visible = rows;
  const shows = await showsByUrl(h.store, visible.map((r) => r.feed_url));
  const slice = visible.slice(0, HOST_PAGE);
  const last = slice[slice.length - 1];
  return {
    items: slice.map((r) => {
      const s = shows.get(r.feed_url);
      const image = str(s?.['newestImage']);
      return { id: r.id, feedUrl: r.feed_url, showTitle: str(s?.['newestTitle']) ?? '', ...(image ? { imageUrl: image } : {}), body: r.body, images: imagesOf(r.images), releaseAt: new Date(r.release_at).toISOString() };
    }),
    ...(visible.length > HOST_PAGE && last ? { next: new Date(last.release_at).toISOString() } : {}),
  };
}
