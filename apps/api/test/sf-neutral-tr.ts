// Translation test helpers: seeds and reads of translation jobs, the Groq ledger and the allow-list, on DynamoDB.
/**
 * The translation tests seed and read translation jobs, the Groq ledger and the allow-list; each helper does it on the items.
 */
import type { TestDb } from './harness.ts';

type JobView = { state: string; errors: number; error: string | null; source_lang: string | null };

const ddb = async () => {
  const [K, store, paginate] = await Promise.all([import('../src/db/ddb/keys.ts'), import('../src/db/ddb/store.ts'), import('../src/db/ddb/paginate.ts')]);
  return { K, store, paginate };
};

/** Every translation job item: the jobs carry G5 `REF#trjob#all`, read back from the table. */
async function ddbJobs(t: TestDb): Promise<Record<string, unknown>[]> {
  const { K, store, paginate } = await ddb();
  const s = t.store;
  const { items } = await paginate.queryAll(s, 'main', {
    IndexName: K.INDEX.G5, KeyConditionExpression: 'G5PK = :r', ExpressionAttributeValues: { ':r': K.G5('trjob', 'all', new Date(0).toISOString()).G5PK },
  });
  const out: Record<string, unknown>[] = [];
  for (const it of items) {
    const got = await store.get(s, 'main', { PK: String(it['PK']), SK: String(it['SK']) });
    if (got) out.push(got);
  }
  return out;
}

/** How many translation jobs exist. */
export async function jobCount(t: TestDb): Promise<number> {
  return (await ddbJobs(t)).length;
}

/** The states of every job. */
export async function jobStates(t: TestDb): Promise<string[]> {
  return (await ddbJobs(t)).map((j) => String(j['state']));
}

/** One job as { state, errors, error, source_lang }, or undefined. */
export async function jobView(t: TestDb, episodeId: string, lang: string): Promise<JobView | undefined> {
  const { K, store } = await ddb();
  const it = await store.get(t.store, 'main', K.translationJob(episodeId, lang));
  return it ? { state: String(it['state']), errors: Number(it['errors'] ?? 0), error: (it['error'] ?? null) as string | null, source_lang: (it['sourceLang'] ?? null) as string | null } : undefined;
}

/** A queued job, as the request route makes it. */
export async function seedJob(t: TestDb, episodeId: string, lang: 'en' | 'zh-Hans'): Promise<void> {
  await (await import('../src/db/repos/safety/translation.ts')).insertTranslationJob(t.db, episodeId, lang);
}

/** Seconds from now until the (single) job's `not_before`. */
export async function parkedWaitS(t: TestDb): Promise<number> {
  const [j] = await ddbJobs(t);
  return Math.round((Date.parse(String(j!['notBefore'])) - t.store.clock.now()) / 1000);
}

const today = async (t: TestDb): Promise<string> => (await ddb()).K.day(t.store.clock.now());

/** Today's Groq ledger, by model. */
export async function groqUsage(t: TestDb): Promise<{ model: string; requests: number; audio_s: number; tokens: number }[]> {
  const { K, paginate } = await ddb();
  const { items } = await paginate.queryAll(t.store, 'events', {
    KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': K.groqUsage(await today(t), '').PK }, ConsistentRead: true,
  });
  return items.map((it) => ({ model: String(it['model']), requests: Number(it['requests']), audio_s: Number(it['audioS']), tokens: Number(it['tokens']) }))
    .sort((a, b) => a.model.localeCompare(b.model));
}

/** Puts today's ledger row for one model. */
export async function setGroqUsage(t: TestDb, model: string, requests: number, audioS: number, tokens: number): Promise<void> {
  const [{ K, store }, { encode }] = await Promise.all([ddb(), import('../src/db/ddb/codec.ts')]);
  const day = await today(t);
  await store.put(t.store, 'events', encode('groqUsage', K.groqUsage(day, model), { day, model, requests, audioS, tokens }));
}

/** Empties the ledger (a fresh day). */
export async function clearGroqUsage(t: TestDb): Promise<void> {
  const { K, store } = await ddb();
  const day = await today(t);
  for (const u of await groqUsage(t)) await store.del(t.store, 'events', K.groqUsage(day, u.model));
}

/** How many shows are on the translation allow-list. */
export async function translationShowCount(t: TestDb): Promise<number> {
  const { K, paginate } = await ddb();
  const { items } = await paginate.queryAll(t.store, 'main', {
    KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': K.translationShow('').PK }, ConsistentRead: true,
  });
  return items.length;
}
