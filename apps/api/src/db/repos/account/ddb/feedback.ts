// Feedback (with its small images) and our own error log on DynamoDB.
/**
 * M26 lane AC (AC-T05; patterns AC-24…AC-33).
 * - Feedback: `FB#<id>/F` (+ `IMG#<n>` ≤ 250 KB binary each, data-model §13) in ONE transaction with the
 *   image byte counter (`CFG#bytes.feedbackImageBytes`, §7 B) and, for a signed-in sender with images, the
 *   listener's `FBIMG` item: the times of their picture messages (the "5 a day" check reads it strongly —
 *   never a GSI, it is the sender's own write). Owner list: G4 `Q#feedback` newest first; images also sit
 *   on G4 `Q#feedback-images` by time so the 90-day sweep finds them without a Scan.
 * - Errors: the `U#ERR#<sha(scope, message, version, platform)>` item IS the row (§5): an upsert is one
 *   UpdateItem that ADDs to `count`; G4 `Q#errors` sorted by `lastSeen`; G1 by the last sender, so the
 *   deletion job can clear `listenerId` (the old ON DELETE SET NULL).
 */
import { randomUUID } from 'node:crypto';
import { encode, ttlAfter } from '../../../ddb/codec.ts';
import * as K from '../../../ddb/keys.ts';
import { batchGetAll } from '../../../ddb/batch.ts';
import { del, get, update } from '../../../ddb/store.ts';
import { tx } from '../../../ddb/tx.ts';
import { withVersionRetry } from '../../../ddb/retry.ts';
import { IMAGE_DAYS, IMAGES_MAX, type FeedbackRow, type ImageIn } from '../feedback.ts';
import { ERROR_DAYS, MESSAGE_MAX, SCOPE_MAX, STACK_MAX, type ErrorIn, type ErrorRow } from '../error-reports.ts';
import { sweepRateCounters } from '../../../../auth/rate.ts';
import { DAY_MS, iso, nowMs, queueBefore, queueNewest, upd, adel, txa, type Hybrid } from './common.ts';

const BYTES = K.config('bytes');
const FBIMG = (id: string) => ({ PK: K.L(id), SK: 'FBIMG' });

export async function createFeedback(h: Hybrid, f: { listenerId: string | null; kind: string; body: string; appVersion?: string; images: readonly ImageIn[] }): Promise<string> {
  const id = randomUUID();
  const imgs = f.images.slice(0, IMAGES_MAX);
  await withVersionRetry(async () => {
    const now = nowMs(h);
    const createdAt = iso(now);
    const t = txa(h.store).put('main', encode('feedback', K.feedback(id), {
      id, listenerId: f.listenerId, kind: f.kind, body: f.body, appVersion: f.appVersion ?? null, createdAt, images: imgs.length,
    }, { gsi: K.G4('feedback', createdAt, id) }), { condition: 'attribute_not_exists(PK)' });
    let bytes = 0;
    imgs.forEach((img, i) => {
      bytes += img.bytes.byteLength;
      t.put('main', encode('feedbackImage', K.feedbackImage(id, i + 1), { n: i + 1, mime: img.mime, bytes: img.bytes, createdAt }, { gsi: K.G4('feedback-images', createdAt, `${id}#${i + 1}`) }));
    });
    if (bytes > 0) t.update('main', BYTES, { update: 'SET #t = :t ADD feedbackImageBytes :b', names: { '#t': 't' }, values: { ':t': 'config', ':b': bytes } });
    if (f.listenerId && imgs.length > 0) {
      const log = await get(h.store, 'main', FBIMG(f.listenerId));
      const v = Number(log?.['v'] ?? 0);
      const times = ((log?.['times'] as string[] | undefined) ?? []).filter((x) => Date.parse(x) > now - DAY_MS);
      t.put('main', encode('feedback', FBIMG(f.listenerId), { times: [...times, createdAt], v: v + 1 }, { ttl: ttlAfter(now, 2 * DAY_MS) }), {
        condition: log ? 'v = :v' : 'attribute_not_exists(PK)', ...(log ? { values: { ':v': v } } : {}),
      });
    }
    await t.commit();
  });
  return id;
}

/** M23 US3: this listener's picture messages in the last 24 hours (strongly read from their own item). */
export async function imagesSentToday(h: Hybrid, listenerId: string): Promise<number> {
  const log = await get(h.store, 'main', FBIMG(listenerId));
  const cut = nowMs(h) - DAY_MS;
  return ((log?.['times'] as string[] | undefined) ?? []).filter((x) => Date.parse(x) > cut).length;
}

export async function feedbackImageBytes(h: Hybrid): Promise<number> {
  return Math.max(0, Number((await get(h.store, 'main', BYTES))?.['feedbackImageBytes'] ?? 0));
}

export async function recentFeedback(h: Hybrid, limit = 50): Promise<FeedbackRow[]> {
  const items = await queueNewest(h, 'feedback', limit);
  const ids = [...new Set(items.map((i) => i['listenerId']).filter((x): x is string => typeof x === 'string'))];
  const names = new Map((await batchGetAll(h.store, 'main', ids.map((id) => K.listener(id)))).map((l) => [String(l['id']), String(l['displayName'])]));
  return items.map((i) => ({
    id: String(i['id']), kind: String(i['kind']), body: String(i['body']), app_version: (i['appVersion'] as string | null) ?? null,
    created_at: String(i['createdAt']), display_name: typeof i['listenerId'] === 'string' ? names.get(i['listenerId']) ?? null : null, images: Number(i['images'] ?? 0),
  }));
}

export async function feedbackImage(h: Hybrid, id: string, n: number): Promise<{ mime: string; bytes: Uint8Array } | undefined> {
  const it = await get(h.store, 'main', K.feedbackImage(id, n));
  return it ? { mime: String(it['mime']), bytes: it['bytes'] as Uint8Array } : undefined;
}

/** FR-020: images older than 90 days go (the text stays); the byte counter goes down with them. */
export async function sweepImages(h: Hybrid): Promise<number> {
  const old = await queueBefore(h, 'feedback-images', iso(nowMs(h) - IMAGE_DAYS * DAY_MS));
  let n = 0;
  for (const it of old) {
    const gone = await adel(h.store, 'main', { PK: String(it['PK']), SK: String(it['SK']) }, { returnOld: true });
    if (!gone) continue;
    n++;
    const b = (gone['bytes'] as Uint8Array | undefined)?.byteLength ?? 0;
    if (b > 0) await upd(h.store, 'main', BYTES, { update: 'ADD feedbackImageBytes :b', values: { ':b': -b } });
  }
  return n;
}

// ---- the error log (AC-30…AC-33) ----

const clip = (s: string, n: number) => [...s].slice(0, n).join('');

async function upsertError(h: Hybrid, listenerId: string | null, e: { scope: string; message: string; stack: string | null; appVersion: string; platform: string }): Promise<number> {
  const now = nowMs(h);
  const key = K.U.error(e.scope, e.message, e.appVersion, e.platform);
  const sig = key.PK.slice('U#ERR#'.length);
  const at = iso(now);
  const g4 = K.G4('errors', at, sig);
  const g1 = listenerId ? K.G1(listenerId, 'error', at, sig) : undefined;
  const out = await upd(h.store, 'main', key, {
    update: [
      'SET #t = :t, scope = :s, message = :m, appVersion = :v, platform = :p, firstSeen = if_not_exists(firstSeen, :now), lastSeen = :now',
      'G4PK = :g4pk, G4SK = :g4sk, #ttl = :ttl',
      listenerId ? 'listenerId = :l, G1PK = :g1pk, G1SK = :g1sk' : 'listenerId = if_not_exists(listenerId, :null)',
      e.stack ? 'stack = :st' : 'stack = if_not_exists(stack, :null)',
    ].join(', ') + ' ADD #c :one',
    names: { '#t': 't', '#c': 'count', '#ttl': 'ttl' },
    values: {
      ':t': 'errorReport', ':s': e.scope, ':m': e.message, ':v': e.appVersion, ':p': e.platform, ':now': at, ':one': 1,
      ':g4pk': g4.G4PK, ':g4sk': g4.G4SK, ':ttl': ttlAfter(now, (ERROR_DAYS + 1) * DAY_MS),
      ...(g1 ? { ':l': listenerId, ':g1pk': g1.G1PK, ':g1sk': g1.G1SK } : {}),
      ...(e.stack ? { ':st': e.stack } : {}),
      ...(!g1 || !e.stack ? { ':null': null } : {}),
    },
    returnValues: 'UPDATED_NEW',
  });
  return Number(out?.['count'] ?? 0);
}

export async function recordErrors(h: Hybrid, listenerId: string | null, items: readonly ErrorIn[]): Promise<number> {
  let n = 0;
  for (const e of items) {
    const scope = clip(e.scope.trim(), SCOPE_MAX);
    const message = clip(e.message.trim(), MESSAGE_MAX);
    if (!scope || !message) continue;
    await upsertError(h, listenerId, { scope, message, stack: e.stack ? clip(e.stack, STACK_MAX) : null, appVersion: clip(e.appVersion ?? '', 40), platform: clip(e.platform ?? '', 20) });
    n++;
  }
  return n;
}

export async function recentErrors(h: Hybrid, limit = 200): Promise<ErrorRow[]> {
  return (await queueNewest(h, 'errors', limit)).map((i) => ({
    scope: String(i['scope']), message: String(i['message']), stack: (i['stack'] as string | null | undefined) ?? null,
    app_version: String(i['appVersion'] ?? ''), platform: String(i['platform'] ?? ''), count: Number(i['count'] ?? 0),
    first_seen: String(i['firstSeen']), last_seen: String(i['lastSeen']),
  }));
}

export async function sweepErrorReports(h: Hybrid): Promise<number> {
  const old = await queueBefore(h, 'errors', iso(nowMs(h) - ERROR_DAYS * DAY_MS));
  let n = 0;
  for (const it of old) {
    // Only if it was not seen again since the (eventually consistent) index was read.
    const gone = await adel(h.store, 'main', { PK: String(it['PK']), SK: String(it['SK']) }, { condition: 'lastSeen < :cut', values: { ':cut': iso(nowMs(h) - ERROR_DAYS * DAY_MS) }, returnOld: true }).catch(() => undefined);
    if (gone) n++;
  }
  await sweepRateCounters(h.pg);
  return n;
}

export async function recordServerError(h: Hybrid, e: { message: string; stack?: string }): Promise<boolean> {
  const message = clip(e.message.trim() || 'unknown error', MESSAGE_MAX);
  return (await upsertError(h, null, { scope: 'server', message, stack: e.stack ? clip(e.stack, STACK_MAX) : null, appVersion: '', platform: 'server' })) === 1;
}
