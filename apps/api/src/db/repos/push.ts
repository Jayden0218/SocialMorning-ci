/**
 * M10b US3 — notifications that are actually sent (research R4).
 *
 * The hourly rebuild's `feeds` step already re-reads every followed feed. An episode it
 * registers for the first time, published in the last 48 h, is "new": each follower with
 * "New episodes" on gets one notification per show per cycle (the newest), through Expo's
 * free push service. `push_sent`'s primary key is the "never twice" rule (guard G-N1): a
 * device is told about an episode once, whatever reruns or retries happen.
 */
import type { Db } from '../db.ts';

export const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
export const NEW_WINDOW_HOURS = 48;
const BATCH = 100;

export type PushMessage = { to: string; title: string; body: string; data: Record<string, string>; sound: 'default' };

export async function saveToken(db: Db, listenerId: string, token: string, platform: 'ios' | 'android'): Promise<void> {
  await db.query(
    `INSERT INTO push_tokens (token, listener_id, platform) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET listener_id = excluded.listener_id, platform = excluded.platform`,
    [token, listenerId, platform],
  );
}

export async function deleteToken(db: Db, listenerId: string, token: string): Promise<void> {
  await db.query('DELETE FROM push_tokens WHERE token = $1 AND listener_id = $2', [token, listenerId]);
}

export async function setPrefs(db: Db, listenerId: string, p: { newEpisodes: boolean; popular: boolean }): Promise<void> {
  await db.query(
    `INSERT INTO push_prefs (listener_id, new_episodes, popular) VALUES ($1, $2, $3)
     ON CONFLICT (listener_id) DO UPDATE SET new_episodes = excluded.new_episodes, popular = excluded.popular`,
    [listenerId, p.newEpisodes, p.popular],
  );
}

/**
 * Sends through Expo in batches of 100. A `DeviceNotRegistered` answer deletes that token
 * (the app was uninstalled); any other error leaves it for the next cycle.
 */
export async function sendExpo(db: Db, f: typeof fetch, messages: readonly PushMessage[]): Promise<{ sent: number; dropped: number }> {
  let sent = 0;
  let dropped = 0;
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH);
    const res = await f(EXPO_PUSH, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(batch) });
    if (!res.ok) throw new Error(`Expo push answered ${res.status}`);
    const body = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    const tickets = body.data ?? [];
    for (let j = 0; j < batch.length; j++) {
      const t = tickets[j];
      const token = batch[j]!.to;
      if (t?.status === 'ok') { sent++; await db.query('UPDATE push_tokens SET last_ok_at = now() WHERE token = $1', [token]); }
      else if (t?.details?.error === 'DeviceNotRegistered') { dropped++; await db.query('DELETE FROM push_tokens WHERE token = $1', [token]); }
    }
  }
  return { sent, dropped };
}

/**
 * One new episode of one show → every follower's devices, once. The `push_sent` insert
 * happens before sending and only for listeners not already told (G-N1).
 */
export async function fanOutNewEpisode(db: Db, f: typeof fetch, ep: { id: string; feedUrl: string; title: string; showTitle: string }): Promise<{ sent: number; dropped: number }> {
  const told = await db.query<{ listener_id: string }>(
    `INSERT INTO push_sent (listener_id, episode_id, kind)
     SELECT s.listener_id, $2, 'new_episode' FROM subscriptions s
     LEFT JOIN push_prefs p ON p.listener_id = s.listener_id
     WHERE s.feed_url = $1 AND s.deleted_at IS NULL AND COALESCE(p.new_episodes, true)
     ON CONFLICT (listener_id, episode_id, kind) DO NOTHING
     RETURNING listener_id`,
    [ep.feedUrl, ep.id],
  );
  if (told.length === 0) return { sent: 0, dropped: 0 };
  const tokens = await db.query<{ token: string }>('SELECT token FROM push_tokens WHERE listener_id = ANY($1::uuid[])', [told.map((t) => t.listener_id)]);
  const messages = tokens.map((t): PushMessage => ({ to: t.token, title: ep.showTitle || 'New episode', body: ep.title, data: { episodeId: ep.id, kind: 'new_episode' }, sound: 'default' }));
  return messages.length === 0 ? { sent: 0, dropped: 0 } : sendExpo(db, f, messages);
}

/** The day's pick → listeners with "Popular content" on, at most once a day each. */
export async function sendPopular(db: Db, f: typeof fetch, pick: { id: string; title: string; why?: string }): Promise<{ sent: number; dropped: number }> {
  const told = await db.query<{ listener_id: string }>(
    `INSERT INTO push_sent (listener_id, episode_id, kind)
     SELECT t.listener_id, $1, 'popular' FROM (SELECT DISTINCT listener_id FROM push_tokens) t
     LEFT JOIN push_prefs p ON p.listener_id = t.listener_id
     WHERE COALESCE(p.popular, true)
       AND NOT EXISTS (SELECT 1 FROM push_sent x WHERE x.listener_id = t.listener_id AND x.kind = 'popular' AND x.sent_at > now() - interval '1 day')
     ON CONFLICT (listener_id, episode_id, kind) DO NOTHING
     RETURNING listener_id`,
    [pick.id],
  );
  if (told.length === 0) return { sent: 0, dropped: 0 };
  const tokens = await db.query<{ token: string }>('SELECT token FROM push_tokens WHERE listener_id = ANY($1::uuid[])', [told.map((t) => t.listener_id)]);
  const messages = tokens.map((t): PushMessage => ({ to: t.token, title: "Today's pick", body: pick.why ? `${pick.title} — ${pick.why}` : pick.title, data: { episodeId: pick.id, kind: 'popular' }, sound: 'default' }));
  return messages.length === 0 ? { sent: 0, dropped: 0 } : sendExpo(db, f, messages);
}
