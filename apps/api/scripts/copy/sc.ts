// Lane SC's copy: comments, reactions, likes, clips, chat, episode likes, statuses — Postgres rows → the items lane SC's code writes.
/**
 * M26 lane MIG (MIG-01…04) for lane SC (data-model.md "Lane SC changes", §6, §7 A). Each source turns rows into the
 * items `src/db/repos/social/ddb/*.ts` would have written for the same data, attribute by attribute:
 * - a comment: the item in `EP#<ep>` (a reply under its root's sort key), `CREF#<id>`, the author index `L#/CMT#`
 *   (only while it has an author and is not a placeholder — the placeholder write deletes it), `likeCount` /
 *   `replyCount` / `unfriendlyCount` counted in SQL, `bucket` when the episode's length is known (comments.ts
 *   `writeComment`), the `Q#removed-media` queue key on a removed comment still holding a recording or a picture;
 * - `EP#<ep>/SOCIAL` (owned here): `commentCount` = live top-level comments (`countsAsTop`), the two pins, `v` = 1
 *   (a brand-new item's stamp), `likesV` = 1 only when the episode has comment likes;
 * - NOT here: heat marks `HM#` and `EP#/HEAT` (lane LB, from reactions + timestamped comments), the `commented` /
 *   `clipped` activity rows (lane SG), the byte ceilings `CFG#bytes.commentImageBytes` / `.statusPhotoBytes` (lane AC).
 * NULL handling mirrors the writers: an attribute the writer leaves out (or REMOVEs) is omitted; one the writer stores
 * as null on a new item (`parentId`, a voice comment's `body`, `offsetMs`, a chat card's `episodeId`, a like's `note`)
 * is stored as null.
 */
import { bucketOf } from '@socialmorning/social-core';
import { encode } from '../../src/db/ddb/codec.ts';
import * as K from '../../src/db/ddb/keys.ts';
import type { Item } from '../../src/db/ddb/store.ts';
import { countsAsTop } from '../../src/db/repos/social/ddb/sc-common.ts';
import {
  bool, iso, isoReq, json, num, numReq, str, ttlFrom,
  type BackSpec, type CounterCheck, type LaneModule, type Mismatch, type Out, type Row, type TableSpec,
} from './types.ts';

const DAY_MS = 86_400_000;
const PHOTO_PREFIX = 'status-photo:';

const main = (item: Item): Out => ({ table: 'main', item });
const s = (v: unknown): string => String(v);
/** Present only when not null (the writer leaves it out, or REMOVEs it). */
const opt = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v);
const keyText = (i: Item) => `${s(i['PK'])}|${s(i['SK'])}`;
const isNullish = (v: unknown) => v === null || v === undefined;
const back = (v: unknown) => (v === undefined ? null : v);

// ---------------------------------------------------------------- comments (+ CREF#, CMT#, EP#/SOCIAL)

const COMMENT_SQL = `
  SELECT c.id::text AS id, c.episode_id, c.author_id::text AS author_id, c.parent_id::text AS parent_id, c.body, c.offset_ms,
         c.created_at, c.deleted_at, c.removed_at, c.host_hidden_at, c.host_hidden_by::text AS host_hidden_by,
         c.pinned_at, c.pinned_by::text AS pinned_by, c.pinned_bottom_at, c.voice_url, c.voice_path, c.voice_ms, c.transcript,
         c.image_url, c.image_path, c.image_w, c.image_h, c.image_bytes, c.country::text AS country, c.like_notices_off,
         p.created_at AS root_created_at, e.duration_ms,
         (SELECT count(*) FROM comment_likes l WHERE l.comment_id = c.id)::int AS like_count,
         (SELECT count(*) FROM comments r WHERE r.parent_id = c.id)::int AS reply_count,
         (SELECT count(*) FROM comment_unfriendly u WHERE u.comment_id = c.id)::int AS unfriendly_count
    FROM comments c
    LEFT JOIN comments p ON p.id = c.parent_id
    LEFT JOIN episodes e ON e.id = c.episode_id`;

/** The comment's key: a top-level comment by its own time, a reply right after its root (comments.ts `writeComment`). */
function commentKey(r: Row) {
  const episodeId = s(r['episode_id']);
  const createdAt = isoReq(r['created_at']);
  const id = s(r['id']);
  if (isNullish(r['parent_id'])) return K.comment(episodeId, createdAt, id);
  if (isNullish(r['root_created_at'])) throw new Error('copy sc: a reply whose root comment is missing');
  return K.reply(episodeId, { createdAt: isoReq(r['root_created_at']), id: s(r['parent_id']) }, createdAt, id);
}

function commentOuts(r: Row): Out[] {
  const id = s(r['id']);
  const episodeId = s(r['episode_id']);
  const createdAt = isoReq(r['created_at']);
  const deleted = !isNullish(r['deleted_at']);
  const key = commentKey(r);
  const offsetMs = num(r['offset_ms']);
  const duration = num(r['duration_ms']);
  const removedAt = iso(r['removed_at']);
  const media = !isNullish(r['image_path']) || !isNullish(r['voice_url']);
  const pinnedAt = iso(r['pinned_at']);
  const item = encode('comment', key, {
    id, episodeId, authorId: opt(str(r['author_id'])), parentId: str(r['parent_id']),
    // A placeholder REMOVEs body and offsetMs; a live comment stores them (null for a voice comment / no moment).
    body: deleted ? opt(str(r['body'])) : str(r['body']),
    offsetMs: deleted ? opt(offsetMs) : offsetMs,
    bucket: offsetMs !== null && duration !== null && duration > 0 ? bucketOf(offsetMs, duration) : undefined,
    voiceUrl: opt(str(r['voice_url'])), voicePath: opt(str(r['voice_path'])), voiceMs: opt(num(r['voice_ms'])), transcript: opt(str(r['transcript'])),
    imageUrl: opt(str(r['image_url'])), imagePath: opt(str(r['image_path'])), imageW: opt(num(r['image_w'])), imageH: opt(num(r['image_h'])), imageBytes: opt(num(r['image_bytes'])),
    country: opt(str(r['country'])), createdAt,
    deletedAt: opt(iso(r['deleted_at'])), removedAt: opt(removedAt),
    hostHiddenAt: opt(iso(r['host_hidden_at'])), hostHiddenBy: isNullish(r['host_hidden_at']) ? undefined : opt(str(r['host_hidden_by'])),
    // pinEnd writes `pinnedBy = by ?? null`; a pinner's deleted account (SET NULL) leaves null.
    pinnedAt: opt(pinnedAt), pinnedBy: pinnedAt === null ? undefined : str(r['pinned_by']),
    pinnedBottomAt: opt(iso(r['pinned_bottom_at'])),
    likeNoticesOff: bool(r['like_notices_off']) ? true : undefined,
    likeCount: numReq(r['like_count']), replyCount: numReq(r['reply_count']), unfriendlyCount: numReq(r['unfriendly_count']),
  }, removedAt !== null && media ? { gsi: K.G4('removed-media', removedAt, id) } : {});
  const outs: Out[] = [main(item), main(encode('commentRef', K.commentRef(id), { id, episodeId, sk: key.SK }))];
  const authorId = str(r['author_id']);
  if (authorId !== null && !deleted) {
    outs.push(main(encode('authorComment', K.authorComment(authorId, createdAt, id), { id, episodeId, sk: key.SK, parentId: str(r['parent_id']), createdAt })));
  }
  return outs;
}

const SOCIAL_SQL = `
  SELECT c.episode_id,
         (count(*) FILTER (WHERE c.parent_id IS NULL AND c.deleted_at IS NULL AND c.removed_at IS NULL AND c.host_hidden_at IS NULL))::int AS comment_count,
         min(c.id::text) FILTER (WHERE c.pinned_at IS NOT NULL) AS pinned_id,
         min(c.id::text) FILTER (WHERE c.pinned_bottom_at IS NOT NULL) AS pinned_bottom_id,
         greatest(max(c.created_at), max(c.deleted_at), max(c.removed_at), max(c.host_hidden_at), max(c.pinned_at), max(c.pinned_bottom_at),
                  (SELECT max(l.created_at) FROM comment_likes l JOIN comments x ON x.id = l.comment_id WHERE x.episode_id = c.episode_id),
                  (SELECT max(u.created_at) FROM comment_unfriendly u JOIN comments x ON x.id = u.comment_id WHERE x.episode_id = c.episode_id)) AS updated_at,
         (SELECT count(*) FROM comment_likes l JOIN comments x ON x.id = l.comment_id WHERE x.episode_id = c.episode_id)::int AS like_count
    FROM comments c
   GROUP BY c.episode_id`;

function socialOut(r: Row): Out[] {
  const episodeId = s(r['episode_id']);
  return [main(encode('episodeSocial', K.episodeSocial(episodeId), {
    episodeId, v: 1, commentCount: numReq(r['comment_count']),
    pinnedId: opt(str(r['pinned_id'])), pinnedBottomId: opt(str(r['pinned_bottom_id'])),
    likesV: numReq(r['like_count']) > 0 ? 1 : undefined, updatedAt: isoReq(r['updated_at']),
  }))];
}

const commentsBack: BackSpec = {
  pgTable: 'comments', pk: ['id'],
  match: (i) => i['t'] === 'comment',
  toRow: (i) => ({
    id: i['id'], episode_id: i['episodeId'], author_id: back(i['authorId']), parent_id: back(i['parentId']), body: back(i['body']),
    offset_ms: back(i['offsetMs']), created_at: i['createdAt'], deleted_at: back(i['deletedAt']), removed_at: back(i['removedAt']),
    host_hidden_at: back(i['hostHiddenAt']), host_hidden_by: back(i['hostHiddenBy']), pinned_at: back(i['pinnedAt']), pinned_by: back(i['pinnedBy']),
    pinned_bottom_at: back(i['pinnedBottomAt']), voice_url: back(i['voiceUrl']), voice_path: back(i['voicePath']), voice_ms: back(i['voiceMs']),
    transcript: back(i['transcript']), image_url: back(i['imageUrl']), image_path: back(i['imagePath']), image_w: back(i['imageW']),
    image_h: back(i['imageH']), image_bytes: back(i['imageBytes']), country: back(i['country']), like_notices_off: i['likeNoticesOff'] === true,
  }),
};

const comments: TableSpec = {
  pgTable: 'comments',
  sources: [
    { name: 'sc.comments', sql: COMMENT_SQL, keys: ['id'], map: commentOuts },
    { name: 'sc.episode-social', sql: SOCIAL_SQL, keys: ['episode_id'], map: socialOut },
  ],
  counts: [
    { type: 'comment' },
    { label: 'comments → commentRef', type: 'commentRef' },
    { label: 'comments → authorComment (CMT#)', type: 'authorComment', sql: 'SELECT count(*)::int AS n FROM comments WHERE author_id IS NOT NULL AND deleted_at IS NULL' },
    { label: 'comments → episodeSocial', type: 'episodeSocial', sql: 'SELECT count(DISTINCT episode_id)::int AS n FROM comments' },
    {
      label: 'comments → Q#removed-media', type: 'comment', where: (i) => i['G4PK'] === 'Q#removed-media',
      sql: 'SELECT count(*)::int AS n FROM comments WHERE removed_at IS NOT NULL AND (image_path IS NOT NULL OR voice_url IS NOT NULL)',
    },
  ],
  back: [commentsBack],
};

// ---------------------------------------------------------------- reactions (L#/REACT#; the heat marks are lane LB's)

const reactions: TableSpec = {
  pgTable: 'reactions',
  sources: [{
    name: 'sc.reactions',
    sql: 'SELECT listener_id::text AS listener_id, episode_id, bucket, offset_ms, created_at FROM reactions',
    keys: ['listener_id', 'episode_id', 'bucket'],
    map: (r) => {
      const listenerId = s(r['listener_id']);
      const episodeId = s(r['episode_id']);
      const bucket = numReq(r['bucket']);
      return [main(encode('reaction', K.reaction(listenerId, episodeId, bucket), { listenerId, episodeId, bucket, offsetMs: numReq(r['offset_ms']), createdAt: isoReq(r['created_at']) }))];
    },
  }],
  counts: [{ type: 'reaction' }],
  back: [{
    pgTable: 'reactions', pk: ['listener_id', 'episode_id', 'bucket'],
    match: (i) => i['t'] === 'reaction',
    toRow: (i) => ({ listener_id: i['listenerId'], episode_id: i['episodeId'], bucket: i['bucket'], offset_ms: i['offsetMs'], created_at: i['createdAt'] }),
  }],
};

// ---------------------------------------------------------------- clips (+ U#CLIP, CLIPREF#, L#/CLP#)

const clips: TableSpec = {
  pgTable: 'clips',
  sources: [{
    name: 'sc.clips',
    sql: `SELECT id::text AS id, author_id::text AS author_id, client_id, episode_id, start_ms, end_ms, caption, created_at, deleted_at, removed_at FROM clips`,
    keys: ['id'],
    map: (r) => {
      const id = s(r['id']);
      const authorId = s(r['author_id']);
      const clientId = s(r['client_id']);
      const episodeId = s(r['episode_id']);
      const createdAt = isoReq(r['created_at']);
      const deletedAt = opt(iso(r['deleted_at']));
      const key = K.clip(episodeId, createdAt, id);
      return [
        main(encode('clip', key, {
          id, authorId, clientId, episodeId, startMs: numReq(r['start_ms']), endMs: numReq(r['end_ms']), caption: s(r['caption'] ?? ''), createdAt,
          deletedAt, removedAt: opt(iso(r['removed_at'])),
        })),
        main(encode('unique', K.U.clip(authorId, clientId), { owner: id })),
        main(encode('clipRef', K.clipRef(id), { id, episodeId, sk: key.SK })),
        main(encode('authorClip', K.authorClip(authorId, createdAt, id), { id, episodeId, sk: key.SK, createdAt, deletedAt })),
      ];
    },
  }],
  counts: [
    { type: 'clip' },
    { label: 'clips → U#CLIP', type: 'unique', pk: 'U#CLIP#' },
    { label: 'clips → clipRef', type: 'clipRef' },
    { label: 'clips → authorClip (CLP#)', type: 'authorClip' },
  ],
  back: [{
    pgTable: 'clips', pk: ['id'],
    match: (i) => i['t'] === 'clip',
    toRow: (i) => ({
      id: i['id'], author_id: i['authorId'], client_id: i['clientId'], episode_id: i['episodeId'], start_ms: i['startMs'], end_ms: i['endMs'],
      caption: i['caption'] ?? '', created_at: i['createdAt'], deleted_at: back(i['deletedAt']), removed_at: back(i['removedAt']),
    }),
  }],
};

// ---------------------------------------------------------------- comment likes (both sides; likeCount is on the comment)

const commentLikes: TableSpec = {
  pgTable: 'comment_likes',
  sources: [{
    name: 'sc.comment-likes',
    sql: `SELECT l.comment_id::text AS comment_id, l.listener_id::text AS listener_id, l.created_at, c.episode_id
            FROM comment_likes l JOIN comments c ON c.id = l.comment_id`,
    keys: ['comment_id', 'listener_id'],
    map: (r) => {
      const a = { listenerId: s(r['listener_id']), episodeId: s(r['episode_id']), commentId: s(r['comment_id']), createdAt: isoReq(r['created_at']) };
      return [
        main(encode('commentLikeBy', K.commentLikeBy(a.episodeId, a.commentId, a.listenerId), a)),
        main(encode('commentLike', K.commentLike(a.listenerId, a.episodeId, a.commentId), a)),
      ];
    },
  }],
  counts: [{ type: 'commentLikeBy' }, { label: 'comment_likes → commentLike (CLIKE#)', type: 'commentLike' }],
  back: [{
    pgTable: 'comment_likes', pk: ['comment_id', 'listener_id'],
    match: (i) => i['t'] === 'commentLikeBy',
    toRow: (i) => ({ comment_id: i['commentId'], listener_id: i['listenerId'], created_at: i['createdAt'] }),
  }],
};

// ---------------------------------------------------------------- "unfriendly" marks (both sides; unfriendlyCount is on the comment)

const commentUnfriendly: TableSpec = {
  pgTable: 'comment_unfriendly',
  sources: [{
    name: 'sc.comment-unfriendly',
    sql: `SELECT u.comment_id::text AS comment_id, u.listener_id::text AS listener_id, u.created_at, c.episode_id
            FROM comment_unfriendly u JOIN comments c ON c.id = u.comment_id`,
    keys: ['comment_id', 'listener_id'],
    map: (r) => {
      const commentId = s(r['comment_id']);
      const listenerId = s(r['listener_id']);
      const episodeId = s(r['episode_id']);
      return [
        main(encode('unfriendlyMark', K.unfriendlyMark(episodeId, commentId, listenerId), { commentId, listenerId, createdAt: isoReq(r['created_at']) })),
        main(encode('unfriendlyPtr', K.unfriendlyPtr(listenerId, commentId), { commentId, episodeId })),
      ];
    },
  }],
  counts: [{ type: 'unfriendlyMark' }, { label: 'comment_unfriendly → unfriendlyPtr (UNF#)', type: 'unfriendlyPtr' }],
  back: [{
    pgTable: 'comment_unfriendly', pk: ['comment_id', 'listener_id'],
    match: (i) => i['t'] === 'unfriendlyMark',
    toRow: (i) => ({ comment_id: i['commentId'], listener_id: i['listenerId'], created_at: i['createdAt'] }),
  }],
};

// ---------------------------------------------------------------- chat (CH# pair, CHM# ref, CONV# both sides, SEQ#chat_messages)

/** Both sides of every pair, keyed by the pair without depending on collation (least/greatest only group). */
const CONV_SQL = `
  SELECT least(sender_id::text, recipient_id::text) AS a, greatest(sender_id::text, recipient_id::text) AS b,
         max(created_at) AS updated_at,
         (max(id) FILTER (WHERE recipient_id::text = least(sender_id::text, recipient_id::text) AND read_at IS NOT NULL))::text AS a_last_read,
         (max(id) FILTER (WHERE recipient_id::text = greatest(sender_id::text, recipient_id::text) AND read_at IS NOT NULL))::text AS b_last_read
    FROM chat_messages
   GROUP BY least(sender_id::text, recipient_id::text), greatest(sender_id::text, recipient_id::text)`;

/**
 * `L#<me>/CONV#<partner>`: `updatedAt` = the pair's last message (every send sets it on both sides); `lastReadId` = the
 * newest message to me that I had read (read_at set) — unread is then "the partner's messages above it", the same
 * set as the old `read_at IS NULL` (reading marks a whole conversation at once). Absent when I never read one.
 */
function convOuts(r: Row): Out[] {
  const a = s(r['a']);
  const b = s(r['b']);
  const updatedAt = isoReq(r['updated_at']);
  const side = (me: string, partner: string, lastRead: unknown) =>
    main(encode('conversation', K.conversation(me, partner), { listenerId: me, partnerId: partner, lastReadId: opt(num(lastRead)), updatedAt }));
  return [side(a, b, r['a_last_read']), side(b, a, r['b_last_read'])];
}

const chatMessages: TableSpec = {
  pgTable: 'chat_messages',
  sources: [
    {
      name: 'sc.chat-messages',
      sql: `SELECT id::text AS id, sender_id::text AS sender_id, recipient_id::text AS recipient_id, body, episode_id, created_at, removed_at FROM chat_messages`,
      keys: ['id'],
      map: (r) => {
        const id = numReq(r['id']);
        const senderId = s(r['sender_id']);
        const recipientId = s(r['recipient_id']);
        return [
          main(encode('chatMessage', K.chatMessage(senderId, recipientId, id), {
            id, senderId, recipientId, body: s(r['body'] ?? ''), episodeId: str(r['episode_id']), createdAt: isoReq(r['created_at']), removedAt: opt(iso(r['removed_at'])),
          })),
          main(encode('chatRef', K.chatRef(id), { id, pk: K.chatPair(senderId, recipientId) })),
        ];
      },
    },
    { name: 'sc.chat-conversations', sql: CONV_SQL, keys: ['a', 'b'], map: convOuts },
    {
      // The old bigserial: the counter's value = the highest id issued; no item while the table is empty (seq.ts readSeq → 0).
      name: 'sc.chat-seq',
      sql: `SELECT 'chat_messages' AS name, max(id)::text AS v FROM chat_messages HAVING count(*) > 0`,
      keys: ['name'],
      map: (r) => [main(encode('seq', K.seq('chat_messages'), { v: numReq(r['v']) }))],
    },
  ],
  counts: [
    { type: 'chatMessage' },
    { label: 'chat_messages → chatRef (CHM#)', type: 'chatRef' },
    {
      label: 'chat_messages → conversation (2 per pair)', type: 'conversation',
      sql: `SELECT (2 * count(*))::int AS n FROM (SELECT DISTINCT least(sender_id::text, recipient_id::text), greatest(sender_id::text, recipient_id::text) FROM chat_messages) x`,
    },
    { label: 'chat_messages → SEQ#chat_messages', type: 'seq', pk: 'SEQ#chat_messages', sql: 'SELECT (CASE WHEN count(*) > 0 THEN 1 ELSE 0 END)::int AS n FROM chat_messages' },
  ],
  back: [{
    pgTable: 'chat_messages', pk: ['id'],
    match: (i) => i['t'] === 'chatMessage',
    // read_at cannot be recovered from a message item (read state is the CONV# mark by id, no time): copy-back leaves it NULL.
    toRow: (i) => ({
      id: i['id'], sender_id: i['senderId'], recipient_id: i['recipientId'], body: i['body'] ?? '', episode_id: back(i['episodeId']),
      created_at: i['createdAt'], removed_at: back(i['removedAt']), read_at: null,
    }),
  }],
};

// ---------------------------------------------------------------- episode likes (ELIKE# + ELIKET#), like-post comments and reactions (LK#)

const episodeLikes: TableSpec = {
  pgTable: 'episode_likes',
  sources: [{
    name: 'sc.episode-likes',
    sql: 'SELECT listener_id::text AS listener_id, episode_id, note, created_at FROM episode_likes',
    keys: ['listener_id', 'episode_id'],
    map: (r) => {
      const a = { listenerId: s(r['listener_id']), episodeId: s(r['episode_id']), note: str(r['note']), createdAt: isoReq(r['created_at']) };
      return [
        main(encode('episodeLike', K.episodeLike(a.listenerId, a.episodeId), a)),
        main(encode('episodeLikeTime', K.episodeLikeTime(a.listenerId, a.createdAt, a.episodeId), a)),
      ];
    },
  }],
  counts: [{ type: 'episodeLike' }, { label: 'episode_likes → episodeLikeTime (ELIKET#)', type: 'episodeLikeTime' }],
  back: [{
    pgTable: 'episode_likes', pk: ['listener_id', 'episode_id'],
    match: (i) => i['t'] === 'episodeLike',
    toRow: (i) => ({ listener_id: i['listenerId'], episode_id: i['episodeId'], note: back(i['note']), created_at: i['createdAt'] }),
  }],
};

const likeComments: TableSpec = {
  pgTable: 'like_comments',
  sources: [{
    name: 'sc.like-comments',
    sql: 'SELECT id::text AS id, owner_id::text AS owner_id, episode_id, author_id::text AS author_id, body, created_at, deleted_at FROM like_comments',
    keys: ['id'],
    map: (r) => {
      const id = s(r['id']);
      const ownerId = s(r['owner_id']);
      const episodeId = s(r['episode_id']);
      const authorId = s(r['author_id']);
      const createdAt = isoReq(r['created_at']);
      const key = K.likeComment(ownerId, episodeId, createdAt, id);
      return [
        main(encode('likeComment', key, { id, ownerId, episodeId, authorId, body: s(r['body']), createdAt, deletedAt: opt(iso(r['deleted_at'])) })),
        main(encode('likeCommentPtr', K.likeCommentPtr(authorId, ownerId, episodeId, id), { ownerId, episodeId, id, sk: key.SK })),
      ];
    },
  }],
  counts: [{ type: 'likeComment' }, { label: 'like_comments → likeCommentPtr (LKC#)', type: 'likeCommentPtr' }],
  back: [{
    pgTable: 'like_comments', pk: ['id'],
    match: (i) => i['t'] === 'likeComment',
    toRow: (i) => ({ id: i['id'], owner_id: i['ownerId'], episode_id: i['episodeId'], author_id: i['authorId'], body: i['body'], created_at: i['createdAt'], deleted_at: back(i['deletedAt']) }),
  }],
};

const likeReactions: TableSpec = {
  pgTable: 'like_reactions',
  sources: [{
    name: 'sc.like-reactions',
    sql: 'SELECT owner_id::text AS owner_id, episode_id, listener_id::text AS listener_id, emoji, created_at FROM like_reactions',
    keys: ['owner_id', 'episode_id', 'listener_id'],
    map: (r) => {
      const ownerId = s(r['owner_id']);
      const episodeId = s(r['episode_id']);
      const listenerId = s(r['listener_id']);
      return [
        main(encode('likeReaction', K.likeReaction(ownerId, episodeId, listenerId), { ownerId, episodeId, listenerId, emoji: s(r['emoji']), createdAt: isoReq(r['created_at']) })),
        main(encode('likeReactionPtr', K.likeReactionPtr(listenerId, ownerId, episodeId), { ownerId, episodeId })),
      ];
    },
  }],
  counts: [{ type: 'likeReaction' }, { label: 'like_reactions → likeReactionPtr (LKR#)', type: 'likeReactionPtr' }],
  back: [{
    pgTable: 'like_reactions', pk: ['owner_id', 'episode_id', 'listener_id'],
    match: (i) => i['t'] === 'likeReaction',
    toRow: (i) => ({ owner_id: i['ownerId'], episode_id: i['episodeId'], listener_id: i['listenerId'], emoji: i['emoji'], created_at: i['createdAt'] }),
  }],
};

// ---------------------------------------------------------------- statuses (VP# partitions, VPOST#/VPR#/VPX# pointers, Q#statuses, VPUP#)

/**
 * Expired statuses are copied too: the code keeps them until the hourly sweep deletes them (every read filters
 * `expiresAt`), and the sweep finds them through `Q#statuses` below now. Children carry the status's CURRENT
 * `expiresAt` (a moderation end moved it) and the same TTL backstop (`expiresAt` + 1 day).
 */
const statusTtl = (expiresAt: unknown) => ttlFrom(expiresAt, DAY_MS);

const voicePosts: TableSpec = {
  pgTable: 'voice_posts',
  sources: [{
    name: 'sc.voice-posts',
    sql: `SELECT v.id::text AS id, v.listener_id::text AS listener_id, v.blob_url, v.blob_path, v.duration_ms, v.bytes, v.transcript, v.body,
                 v.created_at, v.expires_at, v.milestone_sent_at,
                 (SELECT count(*) FROM status_reactions r WHERE r.post_id = v.id)::int AS reaction_count,
                 (SELECT count(*) FROM status_replies r WHERE r.post_id = v.id)::int AS reply_count
            FROM voice_posts v`,
    keys: ['id'],
    map: (r) => {
      const id = s(r['id']);
      const listenerId = s(r['listener_id']);
      const createdAt = isoReq(r['created_at']);
      const expiresAt = isoReq(r['expires_at']);
      const ttl = statusTtl(expiresAt);
      return [
        main(encode('voicePost', K.voicePost(id), {
          id, listenerId, blobUrl: opt(str(r['blob_url'])), blobPath: opt(str(r['blob_path'])), durationMs: opt(num(r['duration_ms'])), bytes: opt(num(r['bytes'])),
          transcript: opt(str(r['transcript'])), body: opt(str(r['body'])), createdAt, expiresAt, milestoneSentAt: opt(iso(r['milestone_sent_at'])),
          reactionCount: numReq(r['reaction_count']), replyCount: numReq(r['reply_count']),
        }, { gsi: K.G4('statuses', expiresAt, id), ttl })),
        main(encode('voicePostPtr', K.voicePostPtr(listenerId, createdAt, id), { id, createdAt, expiresAt }, { ttl })),
      ];
    },
  }],
  counts: [{ type: 'voicePost' }, { label: 'voice_posts → voicePostPtr (VPOST#)', type: 'voicePostPtr' }],
  back: [{
    pgTable: 'voice_posts', pk: ['id'],
    match: (i) => i['t'] === 'voicePost',
    toRow: (i) => ({
      id: i['id'], listener_id: i['listenerId'], blob_url: back(i['blobUrl']), blob_path: back(i['blobPath']), duration_ms: back(i['durationMs']),
      bytes: back(i['bytes']), transcript: back(i['transcript']), body: back(i['body']), created_at: i['createdAt'], expires_at: i['expiresAt'],
      milestone_sent_at: back(i['milestoneSentAt']),
    }),
  }],
};

const statusReplies: TableSpec = {
  pgTable: 'status_replies',
  sources: [{
    name: 'sc.status-replies',
    sql: `SELECT r.id::text AS id, r.post_id::text AS post_id, r.author_id::text AS author_id, r.body, r.audio_key, r.audio_url, r.audio_ms, r.created_at, v.expires_at
            FROM status_replies r JOIN voice_posts v ON v.id = r.post_id`,
    keys: ['id'],
    map: (r) => {
      const id = s(r['id']);
      const postId = s(r['post_id']);
      const authorId = s(r['author_id']);
      const createdAt = isoReq(r['created_at']);
      const expiresAt = isoReq(r['expires_at']);
      const ttl = statusTtl(expiresAt);
      return [
        main(encode('statusReply', K.statusReply(postId, createdAt, id), {
          id, postId, authorId, body: opt(str(r['body'])), audioKey: opt(str(r['audio_key'])), audioUrl: opt(str(r['audio_url'])), audioMs: opt(num(r['audio_ms'])), createdAt, expiresAt,
        }, { ttl })),
        main(encode('statusReplyPtr', K.statusReplyPtr(authorId, postId, id), { postId, id, expiresAt }, { ttl })),
      ];
    },
  }],
  counts: [{ type: 'statusReply' }, { label: 'status_replies → statusReplyPtr (VPR#)', type: 'statusReplyPtr' }],
  back: [{
    pgTable: 'status_replies', pk: ['id'],
    match: (i) => i['t'] === 'statusReply',
    toRow: (i) => ({
      id: i['id'], post_id: i['postId'], author_id: i['authorId'], body: back(i['body']), audio_key: back(i['audioKey']), audio_url: back(i['audioUrl']),
      audio_ms: back(i['audioMs']), created_at: i['createdAt'],
    }),
  }],
};

const statusReactions: TableSpec = {
  pgTable: 'status_reactions',
  sources: [{
    name: 'sc.status-reactions',
    sql: `SELECT r.post_id::text AS post_id, r.listener_id::text AS listener_id, r.kind, r.created_at, v.expires_at
            FROM status_reactions r JOIN voice_posts v ON v.id = r.post_id`,
    keys: ['post_id', 'listener_id'],
    map: (r) => {
      const postId = s(r['post_id']);
      const listenerId = s(r['listener_id']);
      const expiresAt = isoReq(r['expires_at']);
      const ttl = statusTtl(expiresAt);
      return [
        main(encode('statusReaction', K.statusReaction(postId, listenerId), { postId, listenerId, kind: numReq(r['kind']), createdAt: isoReq(r['created_at']), expiresAt }, { ttl })),
        main(encode('statusReactionPtr', K.statusReactionPtr(listenerId, postId), { postId, expiresAt }, { ttl })),
      ];
    },
  }],
  counts: [{ type: 'statusReaction' }, { label: 'status_reactions → statusReactionPtr (VPX#)', type: 'statusReactionPtr' }],
  back: [{
    pgTable: 'status_reactions', pk: ['post_id', 'listener_id'],
    match: (i) => i['t'] === 'statusReaction',
    toRow: (i) => ({ post_id: i['postId'], listener_id: i['listenerId'], kind: i['kind'], created_at: i['createdAt'] }),
  }],
};

type PhotoBody = { url?: string; bytes?: number; listenerId?: string; postId?: string };

const statusItems: TableSpec = {
  pgTable: 'status_items',
  sources: [
    {
      name: 'sc.status-items',
      sql: `SELECT i.post_id::text AS post_id, i.pos, i.kind, i.episode_id, i.image_key, i.image_url, v.expires_at
              FROM status_items i JOIN voice_posts v ON v.id = i.post_id`,
      keys: ['post_id', 'pos'],
      map: (r) => {
        const postId = s(r['post_id']);
        const pos = numReq(r['pos']);
        const expiresAt = isoReq(r['expires_at']);
        return [main(encode('statusItem', K.statusItem(postId, pos), {
          postId, pos, kind: s(r['kind']), episodeId: opt(str(r['episode_id'])), imageKey: opt(str(r['image_key'])), imageUrl: opt(str(r['image_url'])), expiresAt,
        }, { ttl: statusTtl(expiresAt) }))];
      },
    },
    {
      // Status photo uploads were `status-photo:<path>` rows of the `cache` table (status-items.ts): `VPUP#<sha(path)>`,
      // with the orphan-sweep queue `Q#status-photos` (by upload time) only while not on a status.
      name: 'sc.status-photos',
      sql: `SELECT key, body, fetched_at FROM cache WHERE key LIKE '${PHOTO_PREFIX}%'`,
      keys: ['key'],
      map: (r) => {
        const pathname = s(r['key']).slice(PHOTO_PREFIX.length);
        const body: PhotoBody = json<PhotoBody>(r['body']) ?? {};
        const uploadedAt = isoReq(r['fetched_at']);
        const postId = opt(body.postId);
        return [main(encode('statusPhoto', K.statusPhoto(pathname), {
          pathname, url: s(body.url ?? ''), bytes: Number(body.bytes ?? 0), listenerId: s(body.listenerId ?? ''), postId, uploadedAt,
        }, postId === undefined ? { gsi: K.G4('status-photos', uploadedAt, K.sha(pathname)) } : {}))];
      },
    },
  ],
  counts: [
    { type: 'statusItem' },
    { label: "cache 'status-photo:' rows → statusPhoto (VPUP#)", type: 'statusPhoto', sql: `SELECT count(*)::int AS n FROM cache WHERE key LIKE '${PHOTO_PREFIX}%'` },
  ],
  back: [
    {
      pgTable: 'status_items', pk: ['post_id', 'pos'],
      match: (i) => i['t'] === 'statusItem',
      toRow: (i) => ({ post_id: i['postId'], pos: i['pos'], kind: i['kind'], episode_id: back(i['episodeId']), image_key: back(i['imageKey']), image_url: back(i['imageUrl']) }),
    },
    {
      pgTable: 'cache', pk: ['key'],
      match: (i) => i['t'] === 'statusPhoto',
      toRow: (i) => ({
        key: `${PHOTO_PREFIX}${s(i['pathname'])}`,
        body: { url: i['url'], bytes: i['bytes'], listenerId: i['listenerId'], ...(i['postId'] ? { postId: i['postId'] } : {}) },
        fetched_at: i['uploadedAt'],
      }),
    },
  ],
};

const suggestionMutes: TableSpec = {
  pgTable: 'status_suggestion_mutes',
  sources: [{
    name: 'sc.status-suggestion-mutes',
    sql: 'SELECT listener_id::text AS listener_id, muted_id::text AS muted_id, created_at FROM status_suggestion_mutes',
    keys: ['listener_id', 'muted_id'],
    map: (r) => {
      const listenerId = s(r['listener_id']);
      const mutedId = s(r['muted_id']);
      return [
        main(encode('suggestionMute', K.suggestionMute(listenerId, mutedId), { listenerId, mutedId, createdAt: isoReq(r['created_at']) })),
        main(encode('suggestionMutedBy', K.suggestionMutedBy(mutedId, listenerId), { listenerId: mutedId, muterId: listenerId })),
      ];
    },
  }],
  counts: [{ type: 'suggestionMute' }, { label: 'status_suggestion_mutes → suggestionMutedBy (SMUTEBY#)', type: 'suggestionMutedBy' }],
  back: [{
    pgTable: 'status_suggestion_mutes', pk: ['listener_id', 'muted_id'],
    match: (i) => i['t'] === 'suggestionMute',
    toRow: (i) => ({ listener_id: i['listenerId'], muted_id: i['mutedId'], created_at: i['createdAt'] }),
  }],
};

// ---------------------------------------------------------------- counter checks (read-only, the code's own rules)

function tally(items: readonly Item[], keyFn: (i: Item) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items) { const k = keyFn(i); m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
}

const isReply = (c: Item) => s(c['SK']).includes('#R#');

const commentCounters: CounterCheck = {
  name: 'sc.comment-counters',
  check: (ix) => {
    const out: Mismatch[] = [];
    const likes = tally(ix.ofType('commentLikeBy'), (i) => `${s(i['PK'])}|${s(i['commentId'])}`);
    const marks = tally(ix.ofType('unfriendlyMark'), (i) => `${s(i['PK'])}|${s(i['commentId'])}`);
    const replies = tally(ix.ofType('comment').filter(isReply), (i) => `${s(i['PK'])}|${s(i['SK']).split('#R#')[0]}`);
    for (const c of ix.ofType('comment')) {
      const key = keyText(c);
      const want: [string, unknown, number][] = [
        ['comment.likeCount', c['likeCount'], likes.get(`${s(c['PK'])}|${s(c['id'])}`) ?? 0],
        ['comment.unfriendlyCount', c['unfriendlyCount'], marks.get(`${s(c['PK'])}|${s(c['id'])}`) ?? 0],
        // writeComment ADDs 1 to the root per reply; removeCommentItem takes it back (replies are never placeholders).
        ['comment.replyCount', c['replyCount'], isReply(c) ? 0 : (replies.get(`${s(c['PK'])}|${s(c['SK'])}`) ?? 0)],
      ];
      for (const [counter, stored, recomputed] of want) if (Number(stored ?? 0) !== recomputed) out.push({ counter, key, stored, recomputed });
    }
    return out;
  },
};

const socialCounters: CounterCheck = {
  name: 'sc.episode-social',
  check: (ix) => {
    const out: Mismatch[] = [];
    const seen = new Set<string>();
    for (const soc of ix.ofType('episodeSocial')) {
      const pk = s(soc['PK']);
      seen.add(pk);
      const cs = ix.partition('main', pk).filter((i) => i['t'] === 'comment');
      const key = keyText(soc);
      const top = cs.filter(countsAsTop).length;
      if (Number(soc['commentCount'] ?? 0) !== top) out.push({ counter: 'social.commentCount', key, stored: soc['commentCount'], recomputed: top });
      // The pins: the SOCIAL attribute names the one comment carrying the mark (the old partial unique indexes).
      for (const [field, attr] of [['pinnedId', 'pinnedAt'], ['pinnedBottomId', 'pinnedBottomAt']] as const) {
        const marked = cs.filter((c) => !isNullish(c[attr])).map((c) => s(c['id'])).sort();
        const recomputed = marked.length === 0 ? null : marked.join(',');
        const stored = isNullish(soc[field]) ? null : s(soc[field]);
        if (stored !== recomputed) out.push({ counter: `social.${field}`, key, stored, recomputed });
      }
    }
    for (const c of ix.ofType('comment')) {
      const pk = s(c['PK']);
      if (!seen.has(pk)) { seen.add(pk); out.push({ counter: 'social.missing', key: `${pk}|SOCIAL`, stored: null, recomputed: 'an episodeSocial item' }); }
    }
    return out;
  },
};

const statusCounters: CounterCheck = {
  name: 'sc.status-counters',
  check: (ix) => {
    const out: Mismatch[] = [];
    const reacts = tally(ix.ofType('statusReaction'), (i) => s(i['PK']));
    const replies = tally(ix.ofType('statusReply'), (i) => s(i['PK']));
    for (const p of ix.ofType('voicePost')) {
      const key = keyText(p);
      const r1 = reacts.get(s(p['PK'])) ?? 0;
      const r2 = replies.get(s(p['PK'])) ?? 0;
      if (Number(p['reactionCount'] ?? 0) !== r1) out.push({ counter: 'status.reactionCount', key, stored: p['reactionCount'], recomputed: r1 });
      if (Number(p['replyCount'] ?? 0) !== r2) out.push({ counter: 'status.replyCount', key, stored: p['replyCount'], recomputed: r2 });
    }
    return out;
  },
};

const chatSeq: CounterCheck = {
  name: 'sc.seq-chat_messages',
  check: (ix) => {
    const max = ix.ofType('chatMessage').reduce((m, i) => Math.max(m, Number(i['id'])), 0);
    const seqItem = ix.get('main', K.seq('chat_messages').PK, 'S');
    const stored = seqItem ? Number(seqItem['v']) : 0;
    return stored >= max ? [] : [{ counter: 'seq.chat_messages', key: 'SEQ#chat_messages|S', stored, recomputed: max }];
  },
};

// Parents before children: comments before likes/marks (they JOIN it), voice_posts before its children, episode_likes before like_*.
const tables: TableSpec[] = [
  comments, reactions, clips, commentLikes, commentUnfriendly, chatMessages,
  episodeLikes, likeComments, likeReactions,
  voicePosts, statusReplies, statusReactions, statusItems, suggestionMutes,
];

export const lane: LaneModule = {
  lane: 'sc',
  tables,
  counters: [commentCounters, socialCounters, statusCounters, chatSeq],
};
