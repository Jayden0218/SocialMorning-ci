// Chat on DynamoDB: a pair partition with numeric message ids, a conversation item on each side, read marks by id.
/**
 * M26 lane SC (SC-T07; data-model.md §2 "ids stay as they are", SC hard case 5).
 * - `CH#<a>#<b>` (a < b) / `M#<id padded>`: the messages of one pair. The id is a NUMBER from `SEQ#chat_messages`
 *   (the old bigserial), so the phone's `?after=` / `?before=` cursor is unchanged and pages are SK ranges.
 * - `CHM#<id> / R` → the pair (a message by id: moderation, reports).
 * - `L#<me> / CONV#<partner>`: my side of the conversation — `updatedAt` (the list and the per-minute floor) and
 *   `lastReadId` (every message from the partner up to it is read). Reading moves my `lastReadId`; a message I sent
 *   is "read" when it is at or below the partner's. Unread = the partner's messages above my `lastReadId`.
 * Follows (lane SG), blocks (lane SF) are read through those lanes' functions; names from lane AC's items.
 */
import type { Db } from '../../../db.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { encode } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { queryAll } from '../../../ddb/paginate.ts';
import { nextSeq } from '../../../ddb/seq.ts';
import { get, type Item, type Store } from '../../../ddb/store.ts';
import { tx, TxCancelled } from '../../../ddb/tx.ts';
import { isBlockedBy } from '../../safety/blocks.ts';
import { isFollowing } from '../follows.ts';
import { CHAT_PAGE, toPerson, type ChatEpisode, type ChatMessage, type ChatPerson, type Conversation } from '../chat.ts';
import * as B from './sc-bridge.ts';
import { nowIso, people, person as personItem, prefixItems, rawPg, visiblePerson } from './sc-common.ts';
import { blockedEitherWay, mutualFollowIds } from './sc-foreign.ts';

const M = (id: number) => `M#${id}`; // RED BREAK G-M26-SC5
/** Byte order, as the SQL `ORDER BY lower(display_name), id` sorted. */
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

async function walled(db: Db, a: string, b: string): Promise<boolean> {
  return (await isBlockedBy(db, a, b)) || (await isBlockedBy(db, b, a));
}

export async function canChat(_store: Store, db: Db, a: string, b: string): Promise<boolean> {
  return (await isFollowing(db, a, b)) && (await isFollowing(db, b, a)) && !(await walled(db, a, b));
}

export async function person(store: Store, _db: Db, id: string): Promise<ChatPerson | undefined> {
  const p = await personItem(store, id);
  return visiblePerson(p) ? toPerson({ id: p.id, display_name: p.displayName, avatar_url: p.avatarUrl ?? null }) : undefined;
}

/** Episode cards for messages (lane LB's items, one BatchGet). */
async function episodeCards(store: Store, ids: Iterable<string>): Promise<Map<string, ChatEpisode>> {
  const want = [...new Set(ids)];
  if (want.length === 0) return new Map();
  const items = await batchGetAll(store, 'main', want.map((id) => K.episode(id)));
  return new Map(items.map((e) => [String(e['id']), {
    id: String(e['id']), feedUrl: String(e['feedUrl'] ?? ''), guid: String(e['guid'] ?? ''), title: String(e['title'] ?? ''), showTitle: String(e['showTitle'] ?? ''),
    enclosureUrl: String(e['enclosureUrl'] ?? ''), ...(e['imageUrl'] ? { imageUrl: String(e['imageUrl']) } : {}),
    ...(e['durationMs'] !== undefined && e['durationMs'] !== null ? { durationMs: Number(e['durationMs']) } : {}),
  } satisfies ChatEpisode]));
}

function toMessage(m: Item, me: string, cards: Map<string, ChatEpisode>, read: boolean): ChatMessage {
  const episode = m['episodeId'] ? cards.get(String(m['episodeId'])) : undefined;
  return { id: String(m['id']), fromMe: m['senderId'] === me, body: String(m['body'] ?? ''), ...(episode ? { episode } : {}), createdAt: String(m['createdAt']), read };
}

/** My side and the partner's side of the conversation (strong). */
async function sides(store: Store, me: string, other: string): Promise<{ mine: Item | undefined; theirs: Item | undefined }> {
  const [mine, theirs] = await Promise.all([get(store, 'main', K.conversation(me, other)), get(store, 'main', K.conversation(other, me))]);
  return { mine, theirs };
}

const readFlag = (m: Item, me: string, myLastRead: number, theirLastRead: number): boolean =>
  m['senderId'] === me ? Number(m['id']) <= theirLastRead : Number(m['id']) <= myLastRead;

export async function send(store: Store, db: Db, from: string, to: string, body: string, episodeId: string | undefined): Promise<ChatMessage> {
  const id = await nextSeq(store, 'chat_messages');
  const createdAt = nowIso(store);
  const pair = K.chatPair(from, to);
  const side = (me: string, partner: string) => ({
    update: 'SET #t = if_not_exists(#t, :type), #l = :me, #p = :partner, #u = :at',
    names: { '#t': 't', '#l': 'listenerId', '#p': 'partnerId', '#u': 'updatedAt' },
    values: { ':type': 'conversation', ':me': me, ':partner': partner, ':at': createdAt },
  });
  const item = encode('chatMessage', K.chatMessage(from, to, id), { id, senderId: from, recipientId: to, body, episodeId: episodeId ?? null, createdAt });
  await tx(store)
    .put('main', item, { condition: 'attribute_not_exists(PK)' })
    .put('main', encode('chatRef', K.chatRef(id), { id, pk: pair }))
    .update('main', K.conversation(from, to), side(from, to))
    .update('main', K.conversation(to, from), side(to, from))
    .commit();
  const raw = rawPg(db);
  if (raw) await B.insertChatMessage(raw, { id, senderId: from, recipientId: to, body, episodeId: episodeId ?? null, createdAt });
  return toMessage(item, from, await episodeCards(store, episodeId ? [episodeId] : []), false);
}

/** The pair's messages that are not removed, in id order (`asc`), within (lo, hi) exclusive, at most `max`. */
async function pairPage(store: Store, a: string, b: string, o: { lo?: number; hi?: number; desc: boolean; max: number }): Promise<Item[]> {
  const lo = o.lo !== undefined ? M(o.lo) : 'M#';
  const hi = o.hi !== undefined ? M(o.hi) : 'M#~';
  return (await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :lo AND :hi', ExpressionAttributeValues: { ':pk': K.chatPair(a, b), ':lo': lo, ':hi': hi },
    ConsistentRead: true, ScanIndexForward: !o.desc,
  }, { max: o.max, keep: (m) => !m['removedAt'] && m['SK'] !== lo && m['SK'] !== hi })).items;
}

/**
 * The conversation with `other`, oldest first. `after` → only newer messages (the poll); `before` → the page before
 * that id (scrolling up); neither → the newest page. Reading marks the other person's messages to me as read
 * (the answer still shows them as they were — the old UPDATE ran after the SELECT). A block either way → none.
 */
export async function thread(store: Store, db: Db, me: string, other: string, opts: { after?: string; before?: string } = {}): Promise<ChatMessage[]> {
  if (await walled(db, me, other)) return [];
  const rows = opts.after !== undefined
    ? await pairPage(store, me, other, { lo: Number(opts.after), desc: false, max: CHAT_PAGE })
    : opts.before !== undefined
      ? (await pairPage(store, me, other, { hi: Number(opts.before), desc: true, max: CHAT_PAGE })).reverse()
      : (await pairPage(store, me, other, { desc: true, max: CHAT_PAGE })).reverse();
  const { mine, theirs } = await sides(store, me, other);
  const myLastRead = Number(mine?.['lastReadId'] ?? 0);
  const cards = await episodeCards(store, rows.flatMap((m) => (m['episodeId'] ? [String(m['episodeId'])] : [])));
  const out = rows.map((m) => toMessage(m, me, cards, readFlag(m, me, myLastRead, Number(theirs?.['lastReadId'] ?? 0))));
  // Everything the partner sent me so far is read now: my mark moves to the pair's newest message (removed ones included).
  const { items: [newest] } = await queryAll(store, 'main', {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :m)', ExpressionAttributeValues: { ':pk': K.chatPair(me, other), ':m': 'M#' }, ConsistentRead: true, ScanIndexForward: false,
  }, { max: 1 });
  const newestId = newest ? Number(newest['id']) : 0;
  if (mine && newestId > myLastRead) {
    const at = nowIso(store);
    await tx(store).update('main', K.conversation(me, other), {
      update: 'SET #r = :n', condition: 'attribute_exists(PK) AND (attribute_not_exists(#r) OR #r < :n)', names: { '#r': 'lastReadId' }, values: { ':n': newestId },
    }).commit().catch((e: unknown) => { if (!(e instanceof TxCancelled && e.conditionFailed)) throw e; });
    const raw = rawPg(db);
    if (raw) await B.readChat(raw, me, other, at);
  }
  return out;
}

/** How many of the partner's messages to me are above my read mark (removed ones do not count). */
async function unreadIn(store: Store, me: string, partner: string, myLastRead: number): Promise<number> {
  return (await pairPage(store, me, partner, { lo: myLastRead, desc: false, max: 10_000 })).filter((m) => m['senderId'] === partner).length;
}

/** Every conversation I have, newest first: the person, the last message, my unread count. */
export async function conversations(store: Store, db: Db, me: string): Promise<Conversation[]> {
  const convs = await prefixItems(store, K.L(me), K.SC_SK.conversations);
  const blocked = await blockedEitherWay(db, me);
  const ppl = await people(store, convs.map((c) => String(c['partnerId'])));
  const rows: { partner: ChatPerson; last: Item; unread: number; canSend: boolean; theirLastRead: number; myLastRead: number }[] = [];
  for (const c of convs) {
    const partnerId = String(c['partnerId']);
    const p = ppl.get(partnerId);
    if (!visiblePerson(p) || blocked.has(partnerId)) continue;
    const [last] = await pairPage(store, me, partnerId, { desc: true, max: 1 });
    if (!last) continue;
    const myLastRead = Number(c['lastReadId'] ?? 0);
    const theirs = await get(store, 'main', K.conversation(partnerId, me));
    rows.push({
      partner: toPerson({ id: p.id, display_name: p.displayName, avatar_url: p.avatarUrl ?? null }), last, myLastRead,
      theirLastRead: Number(theirs?.['lastReadId'] ?? 0), unread: await unreadIn(store, me, partnerId, myLastRead),
      canSend: (await isFollowing(db, me, partnerId)) && (await isFollowing(db, partnerId, me)),
    });
  }
  rows.sort((x, y) => Number(y.last['id']) - Number(x.last['id']));
  const top = rows.slice(0, 200);
  const cards = await episodeCards(store, top.flatMap((r) => (r.last['episodeId'] ? [String(r.last['episodeId'])] : [])));
  return top.map((r) => ({ with: r.partner, last: toMessage(r.last, me, cards, readFlag(r.last, me, r.myLastRead, r.theirLastRead)), unread: r.unread, canSend: r.canSend }));
}

/** My unread messages, from people I can still see (the tab badge). */
export async function unreadCount(store: Store, db: Db, me: string): Promise<number> {
  const convs = await prefixItems(store, K.L(me), K.SC_SK.conversations);
  const blocked = await blockedEitherWay(db, me);
  const ppl = await people(store, convs.map((c) => String(c['partnerId'])));
  let n = 0;
  for (const c of convs) {
    const partnerId = String(c['partnerId']);
    if (!visiblePerson(ppl.get(partnerId)) || blocked.has(partnerId)) continue;
    n += await unreadIn(store, me, partnerId, Number(c['lastReadId'] ?? 0));
  }
  return n;
}

/** People I can start a chat with: we follow each other, no block, not suspended or hidden. By name. */
export async function friends(store: Store, db: Db, me: string): Promise<ChatPerson[]> {
  const ids = await mutualFollowIds(db, me);
  const blocked = await blockedEitherWay(db, me);
  const ppl = await people(store, ids);
  return ids
    .flatMap((id) => { const p = ppl.get(id); return visiblePerson(p) && !blocked.has(id) ? [p] : []; })
    .sort((a, b) => cmp(a.displayName.toLowerCase(), b.displayName.toLowerCase()) || cmp(a.id, b.id))
    .slice(0, 500)
    .map((p) => toPerson({ id: p.id, display_name: p.displayName, avatar_url: p.avatarUrl ?? null }));
}
