// The subscriber-milestone message: sent once to the listener who became a show's 100th, 1 000th or 10 000th subscriber.
/**
 * M24 US12 (specs/025-m24-gaps-and-look). The host saves a short message in Studio › Settings ›
 * Contacts (`show_overrides.milestone_message`). The hourly sweep finds each show with a message
 * whose live subscriber count has reached a milestone not yet sent, picks the listener who is the
 * Nth live subscriber (oldest first), and writes one `milestones_sent` row — the primary key
 * (feed_url, milestone) makes it once per show per milestone, even if two runs overlap.
 *
 * Only a crossing in the last 7 days is sent: a show that already had 5 000 subscribers when the
 * message was first saved does not write to its 100th subscriber from two years ago.
 * The listener reads it in Notifications › From hosts (`hostNotices` unions these rows).
 */
import type { Db } from '../../db.ts';

export const MILESTONES = [100, 1000, 10000] as const;
export const RECENT_DAYS = 7;

/** The message as sent: `{n}` in the host's text becomes the milestone ("1,000"). */
export function milestoneText(template: string, milestone: number): string {
  return template.replace(/\{n\}/g, milestone.toLocaleString('en-US')).slice(0, 200);
}

/** Sends every milestone due now. Returns how many notices were written. */
export async function sendMilestones(db: Db): Promise<number> {
  const shows = await db.query<{ feed_url: string; message: string; n: number }>(
    `SELECT o.feed_url, o.milestone_message AS message, count(s.listener_id)::int AS n
       FROM show_overrides o JOIN subscriptions s ON s.feed_url = o.feed_url AND s.deleted_at IS NULL
      WHERE o.milestone_message IS NOT NULL AND btrim(o.milestone_message) <> ''
      GROUP BY o.feed_url, o.milestone_message
     HAVING count(s.listener_id) >= ${MILESTONES[0]}`);
  let sent = 0;
  for (const s of shows) {
    for (const m of MILESTONES) {
      if (Number(s.n) < m) break;
      const [who] = await db.query<{ listener_id: string; created_at: Date | string }>(
        `SELECT listener_id, created_at FROM subscriptions WHERE feed_url = $1 AND deleted_at IS NULL
          ORDER BY created_at, listener_id OFFSET $2 LIMIT 1`, [s.feed_url, m - 1]);
      if (!who || new Date(who.created_at).getTime() < Date.now() - RECENT_DAYS * 86_400_000) continue;
      const rows = await db.query(
        `INSERT INTO milestones_sent (feed_url, milestone, listener_id, body) VALUES ($1, $2, $3, $4)
         ON CONFLICT (feed_url, milestone) DO NOTHING RETURNING 1`,
        [s.feed_url, m, who.listener_id, milestoneText(s.message.trim(), m)]);
      sent += rows.length;
    }
  }
  return sent;
}
