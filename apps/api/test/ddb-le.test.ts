// Guards of lane LE on DynamoDB: the worst-case blocked-word list round-trips in chunks; shared lists leave with their owner's account.
/**
 * M26 lane LE. Each guard was broken on mirror branch `lane-le-red`, seen red on its own assertion, then restored:
 * - G-M26-LE1 — the worst-case word list (WORDS_MAX = 2000 words of WORD_MAX = 40 four-byte characters, each with an adder
 *   and a time) is written and read back equal. As ONE item it is over DynamoDB's 400 KB limit (asserted below), so it is
 *   stored as a head + chunks (src/db/repos/safety/ddb/words.ts).
 *   Break: in words.ts set `CHUNK_BYTES = 10_000_000` (one chunk) → encode refuses the item (400 KB).
 * - G-M26-LE2 — a deleted account's shared lists are gone (the old `owner_id → listeners ON DELETE CASCADE`), another
 *   listener's list stays. Break: in src/db/repos/account/ddb/deletion.ts drop `'lists'` from PHASES.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ON = Boolean(process.env['DDB_ENDPOINT']);

if (!ON) {
  test('ddb lane LE guards (needs DynamoDB Local: DDB_ENDPOINT, ci/workflows/ddb-api.yml)', { skip: 'no DDB_ENDPOINT' }, () => {});
} else {
  const { freshDb, freshStore, signUp } = await import('./harness.ts');
  const { withStore } = await import('../src/db/backend-ddb.ts');
  const K = await import('../src/db/ddb/keys.ts');
  const { encode, itemSize, ITEM_MAX_BYTES } = await import('../src/db/ddb/codec.ts');
  const { get } = await import('../src/db/ddb/store.ts');
  const { WORDS_MAX, WORD_MAX } = await import('@socialmorning/social-core');
  const W = await import('../src/db/repos/safety/ddb/words.ts');
  const { wordRows, listWords, addWords, removeWord } = await import('../src/db/repos/safety/words.ts');
  const { runDueDeletions } = await import('../src/db/repos/account/deletion.ts');
  const { exportData } = await import('../src/db/repos/account/data-export.ts');
  const { makeDeletionsDue } = await import('./ac-neutral.ts');

  /** Word i: 40 characters from CJK Extension B (4 bytes each in UTF-8), distinct for every i < 2000. */
  const worstWord = (i: number): string =>
    String.fromCodePoint(0x20000 + (i % 1000), 0x20000 + 1000 + Math.floor(i / 1000)) + Array.from({ length: WORD_MAX - 2 }, (_, j) => String.fromCodePoint(0x21000 + j)).join('');

  test('G-M26-LE1: the worst-case blocked-word list (2000 × 40 four-byte characters) round-trips; one item could not hold it', { timeout: 300_000 }, async () => {
    const s = await freshStore();
    try {
      const db = withStore(undefined, s.store);
      const by = '11111111-2222-4333-8444-555555555555';
      const words = Array.from({ length: WORDS_MAX }, (_, i) => worstWord(i));
      assert.equal(new Set(words).size, WORDS_MAX);
      assert.equal(Buffer.byteLength(words[0]!), WORD_MAX * 4, 'four bytes a character');

      // The one-item shape this replaces is over the limit at this size.
      const at = new Date('2026-10-11T00:00:00.000Z').toISOString();
      const map = Object.fromEntries(words.map((w) => [w, { by, at }]));
      assert.throws(() => encode('wordList', K.config('words'), { words: map, v: 1 }), /400 KB/, 'one item cannot hold the worst list');

      // Through the repo the admin route calls (the dual function on a DynamoDB-only Db).
      assert.equal(await addWords(db, words.slice(0, 1000), by), 1000);
      assert.equal(await addWords(db, words.slice(1000), by), 1000);
      const sorted = [...words].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      assert.deepEqual(await wordRows(db), sorted, 'every word read back, in order');
      const listed = await listWords(db);
      assert.equal(listed.length, WORDS_MAX);
      assert.deepEqual(listed.map((r) => r.word), sorted);

      const head = await get(s.store, 'main', K.config('words'), { consistent: true });
      const n = Number(head?.['chunks']);
      assert.ok(n > 1, `stored in ${n} chunks`);
      assert.equal(head?.['words'], undefined, 'the head holds no words');
      for (let c = 0; c < n; c++) {
        const chunk = await get(s.store, 'main', K.configChunk('words', c), { consistent: true });
        assert.ok(chunk, `chunk ${c}`);
        assert.ok(itemSize(chunk!) < ITEM_MAX_BYTES, `chunk ${c} is ${itemSize(chunk!)} bytes`);
        assert.equal(Number(chunk!['v']), Number(head!['v']));
      }

      // Past the limit is still refused; a removal shrinks the list and leaves no stale chunk.
      await assert.rejects(addWords(db, ['one-too-many'], by), /At most 2000 words/);
      for (const w of sorted.slice(0, 520)) assert.equal(await removeWord(db, w), true);
      assert.deepEqual(await wordRows(db), sorted.slice(520));
      const after = Number((await get(s.store, 'main', K.config('words'), { consistent: true }))?.['chunks']);
      assert.ok(after < n, `${after} chunks after the removals`);
      assert.equal(await get(s.store, 'main', K.configChunk('words', after), { consistent: true }), undefined, 'no chunk left behind');
    } finally { await s.close(); }
  });

  test('words: a list stored in the old one-item shape is still read, and the next change rewrites it in chunks', async () => {
    const s = await freshStore();
    try {
      const db = withStore(undefined, s.store);
      const { put } = await import('../src/db/ddb/store.ts');
      await put(s.store, 'main', encode('wordList', K.config('words'), { words: { beta: { by: null, at: '2026-10-11T00:00:00.000Z' }, alpha: { by: null, at: '2026-10-11T00:00:00.000Z' } }, v: 3 }));
      assert.deepEqual(await wordRows(db), ['alpha', 'beta']);
      assert.equal(await addWords(db, ['gamma'], '11111111-2222-4333-8444-555555555555'), 1);
      const head = await get(s.store, 'main', K.config('words'), { consistent: true });
      assert.equal(head?.['words'], undefined);
      assert.equal(Number(head?.['chunks']), 1);
      assert.equal(Number(head?.['v']), 4);
      assert.deepEqual(await wordRows(db), ['alpha', 'beta', 'gamma']);
      assert.deepEqual(W.chunkWords(new Map()), [], 'an empty list has no chunk');
    } finally { await s.close(); }
  });

  test('G-M26-LE2: a deleted account takes its shared lists with it; another listener\'s list stays', async () => {
    const t = await freshDb();
    const a = await signUp(t, 'lists-gone@example.com', 'Gone');
    const b = await signUp(t, 'lists-stay@example.com', 'Stays');
    const make = async (token: string, title: string) => {
      const r = await t.call('POST', '/v1/me/shared-lists', { title, feedUrls: ['https://a.example/1.xml', 'https://a.example/2.xml'] }, token);
      assert.equal(r.status, 200);
      return ((await r.json()) as { id: string }).id;
    };
    const mine = [await make(a.token, 'One'), await make(a.token, 'Two')];
    const theirs = await make(b.token, 'Theirs');
    assert.equal((await t.call('GET', `/v1/lists/${mine[0]}`)).status, 200);
    const exported = (await exportData(t.db, a.id)) as { sharedLists: { id: string; owner_id: string; title: string; feed_urls: string[] }[] };
    assert.deepEqual(exported.sharedLists.map((l) => l.title).sort(), ['One', 'Two'], 'the export lists them');
    assert.deepEqual(exported.sharedLists[0]!.feed_urls, ['https://a.example/1.xml', 'https://a.example/2.xml']);

    assert.equal((await t.call('DELETE', '/v1/me', { password: 'correct horse' }, a.token)).status, 202);
    await makeDeletionsDue(t);
    assert.equal((await runDueDeletions(t.db, {})).deleted, 1);

    for (const id of mine) {
      assert.equal(await get(t.store, 'main', K.sharedList(id), { consistent: true }), undefined, `list ${id} is gone`);
      assert.equal(await get(t.store, 'main', K.sharedListPtr(a.id, id), { consistent: true }), undefined, `pointer ${id} is gone`);
      assert.equal((await t.call('GET', `/v1/lists/${id}`)).status, 404);
    }
    assert.ok(await get(t.store, 'main', K.sharedList(theirs), { consistent: true }), 'the other listener\'s list stays');
    assert.equal((await t.call('GET', `/v1/lists/${theirs}`)).status, 200);
    await t.close();
  });

  test('LE-07 (MIG\'s finding, lane DV): a list whose default tab was set first can still be saved (no 409)', async () => {
    const { aCall, adminSetup, FX } = await import('./admin-harness.ts');
    const { t, owner } = await adminSetup({ picksRaw: [], collectionsRaw: [] });
    try {
      const L = `/v1/admin/lists/${encodeURIComponent('category:1303')}`;
      assert.equal((await aCall(t, 'PUT', `${L}/default-tab`, owner, { tab: 'newest' })).status, 200, 'the tab first: this makes the document');
      assert.equal((await aCall(t, 'POST', L, owner, { kind: 'hide', feedUrl: FX })).status, 200, 'then a save of the same list (was 409)');
      const doc = await get(t.store, 'main', K.listDoc('category:1303'), { consistent: true });
      assert.equal(doc?.['v'], 1, 'version 0 from the tab, 1 after the save');
      assert.equal((await aCall(t, 'PUT', `${L}/default-tab`, owner, { tab: null })).status, 200);
      assert.equal((await aCall(t, 'POST', L, owner, { kind: 'hide', feedUrl: 'https://feeds.example.com/other.xml' })).status, 200, 'and again');
    } finally { await t.close(); }
  });

  test('LE-08 (MIG\'s finding, lane AC): feedback keeps its words but loses its sender when the account is deleted', async () => {
    const t = await freshDb();
    const a = await signUp(t, 'fb-gone@example.com', 'Gone');
    assert.equal((await t.call('POST', '/v1/feedback', { kind: 'Other', body: 'from a leaver' }, a.token)).status, 200);
    const { acScan } = await import('./fixtures.ts');
    const before = (await acScan(t.store, 'main', 'feedback')).find((f) => f['body'] === 'from a leaver');
    assert.equal(before?.['listenerId'], a.id);
    assert.equal(before?.['G1PK'], `AUTH#${a.id}`, 'the item is in the author index');
    assert.equal((await t.call('DELETE', '/v1/me', { password: 'correct horse' }, a.token)).status, 202);
    await makeDeletionsDue(t);
    assert.equal((await runDueDeletions(t.db, {})).deleted, 1);
    const after = (await acScan(t.store, 'main', 'feedback')).find((f) => f['body'] === 'from a leaver');
    assert.ok(after, 'the feedback stays');
    assert.equal(after?.['listenerId'] ?? null, null, 'its sender is gone (the old ON DELETE SET NULL)');
    assert.equal(after?.['G1PK'], undefined);
    await t.close();
  });
}
