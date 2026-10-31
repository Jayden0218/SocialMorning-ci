// The hourly outbox health check: one email when the outbox gets stuck, one when it clears (counts only, never a payload).
/**
 * M28 US3 (research R7, contracts/health-and-parking.md). Problem = the oldest pending entry is older than 15 minutes, or
 * anything is parked. The state lives in `HEALTH#outbox/state`; a CONDITIONAL update moves it, and only the run that moved
 * it sends the email, so two concurrent runs (or a second hour with the same problem) send nothing more.
 * Never throws: a failed read is logged as `health: error <code>` and the next step runs.
 */
import type { Mailer } from '../mail/mailer.ts';
import { health as healthKey, OUTBOX_SHARDS } from '../db/ddb/keys.ts';
import { countAll } from '../db/ddb/paginate.ts';
import { get, isoNow, queryPage, update, type Store } from '../db/ddb/store.ts';
import { swallow } from '../log.ts';

export const HEALTH_MAX_AGE_MS = 15 * 60_000;
export const HEALTH_RUNBOOK = 'docs/runbooks/alarms.md#outbox-health';

export type HealthResult = { oldestAgeMs: number; parked: number; state: 'ok' | 'bad'; emailed: number };

export async function checkOutboxHealth(store: Store, deps: { mailer?: Mailer | undefined; to?: string | undefined; log?: (line: string) => void }): Promise<HealthResult> {
  const log = deps.log ?? ((l: string) => console.log(l));
  try {
    const now = store.clock.now();
    let oldest = 0;
    let parked = 0;
    for (let shard = 0; shard < OUTBOX_SHARDS; shard++) {
      const page = await queryPage(store, 'main', { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `OUTBOX#${shard}` }, Limit: 1, ScanIndexForward: true, ConsistentRead: true });
      const first = page.Items?.[0];
      if (first) oldest = Math.max(oldest, now - Date.parse(String(first['createdAt'])));
      parked += await countAll(store, 'main', { KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': `PARKED#${shard}` }, ConsistentRead: true });
    }
    const want: 'ok' | 'bad' = oldest > HEALTH_MAX_AGE_MS || parked > 0 ? 'bad' : 'ok';
    const key = healthKey('outbox');
    const current = (((await get(store, 'main', key, { consistent: true }))?.['state'] as string | undefined) ?? 'ok') as 'ok' | 'bad';
    const result: HealthResult = { oldestAgeMs: oldest, parked, state: want, emailed: 0 };
    if (current === want) return result;
    if (!deps.mailer || !deps.to) { log('health: no mailer or recipient, state not changed'); return { ...result, state: current }; }

    try {
      await update(store, 'main', key, {
        update: 'SET #t = :t, #s = :s, since = :since, lastOldestAgeMs = :o, lastParked = :p',
        // No item yet counts as ok; only the run that still sees the old state wins.
        condition: current === 'ok' ? 'attribute_not_exists(PK) OR #s = :from' : '#s = :from',
        names: { '#s': 'state', '#t': 't' },
        values: { ':t': 'healthState', ':s': want, ':since': isoNow(store.clock), ':o': oldest, ':p': parked, ':from': current },
      });
    } catch (e) {
      if ((e as { name?: string })?.name === 'ConditionalCheckFailedException') return result; // another run changed it and sends the email
      throw e;
    }
    const minutes = Math.round(oldest / 60_000);
    const lead = want === 'bad' ? 'The outbox is stuck.' : 'The outbox is healthy again.';
    try {
      await deps.mailer.send({
        to: deps.to,
        subject: want === 'bad' ? 'SocialNet: outbox problem' : 'SocialNet: outbox clear',
        text: `${lead}\n\nOldest waiting entry: ${minutes} min\nParked entries: ${parked}\n\nSteps: ${HEALTH_RUNBOOK}\n`,
      });
      result.emailed = 1;
    } catch {
      // The email did not go: hand the transition back so the next run tries again.
      await update(store, 'main', key, { update: 'SET #s = :from', condition: '#s = :s', names: { '#s': 'state' }, values: { ':from': current, ':s': want } }).catch(swallow('outbox_health_state_update_failed'));
      log('health: error mail');
      return { ...result, state: current };
    }
    return result;
  } catch (e) {
    log(`health: error ${(e as { name?: string })?.name ?? 'unknown'}`);
    return { oldestAgeMs: 0, parked: 0, state: 'ok', emailed: 0 };
  }
}
