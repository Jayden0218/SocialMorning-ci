// Tests the codec on DynamoDB Local: every item type round-trips equal, and the attribute allowlists keep person columns off private items.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('ddb codec (needs DynamoDB Local: DDB_ENDPOINT, ci/workflows/ddb-api.yml)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshStore } = await import('./harness.ts');
  const { encode, decode, ITEM_TYPES, STRICT_TYPES, PERSON_ATTRS, CodecError, itemSize, ttlAfter } = await import('../src/db/ddb/codec.ts');
  type ItemType = import('../src/db/ddb/codec.ts').ItemType;
  const K = await import('../src/db/ddb/keys.ts');
  const { put, get } = await import('../src/db/ddb/store.ts');

  /** Replaces the jsonb tests: the shapes that broke on Postgres (nested objects, arrays of arrays, strings that look like JSON). */
  const RICH = {
    title: 'Ep — 小宇宙 🎧', empty: '', jsonLooking: '{"a":1}', n: 42, neg: -3.5, big: Number.MAX_SAFE_INTEGER, zero: 0,
    yes: true, no: false, nothing: null, when: new Date('2026-10-10T05:12:00.123Z'),
    ranges: [[0, 1500], [3000, 4200]], nested: { hosts: [{ name: 'A', url: 'https://a.example' }], links: {}, list: [] },
    tags: new Set(['a', 'b']), nums: new Set([1, 2]), bytes: Buffer.from([0, 1, 2, 255]), gone: undefined,
  };
  const EXPECTED = { ...RICH, when: '2026-10-10T05:12:00.123Z', bytes: new Uint8Array([0, 1, 2, 255]) } as Record<string, unknown>;
  delete EXPECTED['gone'];

  const sample = (type: ItemType): Record<string, unknown> => {
    const def = ITEM_TYPES[type];
    if (def.attrs === 'open') return RICH;
    const vals: unknown[] = ['s', 7, true, null, '2026-10-10T00:00:00.000Z', { x: [1] }];
    return Object.fromEntries((def.attrs as readonly string[]).map((a, i) => [a, vals[i % vals.length]]));
  };

  test('every item type is written and read back equal (replaces jsonb-postgres / jsonb-repair)', async () => {
    const s = await freshStore();
    const types = Object.keys(ITEM_TYPES) as ItemType[];
    assert.ok(types.length >= 80, `all data-model item types registered (${types.length})`);
    for (const type of types) {
      const key = { PK: `TEST#${type}`, SK: 'X' };
      const attrs = sample(type);
      const item = encode(type, key, attrs, { gsi: { G4PK: 'Q#test', G4SK: type }, ttl: ttlAfter(Date.parse('2026-10-10T00:00:00Z'), 86_400_000) });
      const table = ITEM_TYPES[type].table;
      await put(s.store, table, item);
      const back = await get(s.store, table, key);
      assert.ok(back, `${type} read back`);
      const d = decode(back!);
      // Binary may come back as a Buffer (a Uint8Array subclass); compare the bytes.
      for (const [n, v] of Object.entries(d.attrs)) if (v instanceof Uint8Array) d.attrs[n] = new Uint8Array(v);
      assert.equal(d.type, type);
      assert.deepEqual(d.key, key);
      const want = ITEM_TYPES[type].attrs === 'open' ? EXPECTED : attrs;
      assert.deepEqual(d.attrs, want, `${type} round-trips`);
    }
    await s.close();
  });

  test('G-L1 / G-L2 as allowlists: live listeners and promotions are strict and carry no person attribute', () => {
    for (const type of ['liveListener', 'promotion'] as const) {
      assert.ok(STRICT_TYPES.includes(type), `${type} is strict`);
      const attrs = ITEM_TYPES[type].attrs as readonly string[];
      for (const p of PERSON_ATTRS) assert.ok(!attrs.includes(p), `${type} has no ${p}`);
      assert.throws(() => encode(type, { PK: 'X', SK: 'Y' }, { listenerId: 'L1' }), CodecError, `${type} refuses listenerId`);
    }
    assert.deepEqual([...ITEM_TYPES.liveListener.attrs], ['episodeId', 'listenerHash', 'seenAt']);
  });

  test('the codec refuses what DynamoDB cannot hold or what would corrupt an item', () => {
    const k = { PK: 'X', SK: 'Y' };
    assert.throws(() => encode('config', k, { s: new Set() }), /empty Set/);
    assert.throws(() => encode('config', k, { n: Number.NaN }), /finite/);
    assert.throws(() => encode('config', k, { n: 2n ** 60n }), /2\^53/);
    assert.throws(() => encode('config', k, { m: new Map() }), /unsupported/);
    assert.throws(() => encode('config', k, { PK: 'other' }), /reserved/);
    assert.throws(() => encode('config', k, {}, { gsi: { G9PK: 'x' } }), /GSI/);
    assert.throws(() => encode('config', k, {}, { ttl: Date.now() }), /SECONDS/);
    assert.throws(() => encode('config', k, { big: 'x'.repeat(410 * 1024) }), /400 KB/);
    assert.equal(encode('config', k, { n: 5n })['n'], 5);
    assert.ok(itemSize({ a: 'xx' }) >= 3);
  });

  test('keys: feed URLs never appear in keys; times sort as strings; numbers are padded', () => {
    const url = 'https://feeds.example.com/very/long/feed.xml?token=abc';
    const sh = K.show(url);
    assert.ok(!sh.PK.includes('example'));
    assert.equal(K.feedKey(url).length, 22);
    assert.equal(K.feedKey(url), K.feedKey(url));
    assert.ok(K.ts('2026-10-10T05:00:00Z') < K.ts('2026-10-10T05:00:00.001Z'));
    assert.ok(K.NULL_LAST > K.ts('2999-12-31T00:00:00Z'));
    assert.equal(K.pad(42, 5), '00042');
    assert.throws(() => K.pad(-1));
    assert.throws(() => K.bucket(100));
    assert.equal(K.chatPair('b', 'a'), K.chatPair('a', 'b'));
    assert.equal(K.U.email(' A@B.c ').PK, 'U#EMAIL#a@b.c');
    assert.ok(K.reply('e', { id: 'r', createdAt: '2026-10-10T00:00:00Z' }, '2026-10-10T00:01:00Z', 'x').SK.startsWith(K.comment('e', '2026-10-10T00:00:00Z', 'r').SK));
  });
}
