// Tests the M23 feed changes: the shared date reader, the capped charset-aware body reader, new feed fields.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseFeedDate } from '../src/date';
import { charsetHints, decodeFeedBytes, decodeWindows1252, FeedTooLargeError, normaliseCharset, readCapped, readFeedText, type MakeDecoder } from '../src/body';
import { parseFeed } from '../src/parse-feed';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8');
const id = (s: string): string => s.padEnd(16, '0');

test('dates: RFC-822 and ISO, a missing zone is UTC, named zones from the RFC-822 table', () => {
  const at9 = Date.UTC(2024, 8, 10, 9);
  assert.equal(parseFeedDate('Tue, 10 Sep 2024 09:00:00 GMT'), at9);
  assert.equal(parseFeedDate('Tue, 10 Sep 2024 09:00:00'), at9, 'no zone → UTC, not the device clock');
  assert.equal(parseFeedDate('10 Sep 2024 09:00 +0000'), at9, 'no weekday, no seconds');
  assert.equal(parseFeedDate('Tue, 10 Sep 2024 17:00:00 +0800'), at9);
  assert.equal(parseFeedDate('Tue, 10 Sep 2024 17:00:00 GMT+8'), at9);
  assert.equal(parseFeedDate('Tue, 10 Sep 2024 03:00:00 CST'), at9, 'CST is US Central (-06:00) per RFC-822');
  assert.equal(parseFeedDate('Tue, 10 Sep 2024 05:00:00 EDT'), at9);
  assert.equal(parseFeedDate('Tue, 10 Sep 24 09:00:00 GMT'), at9, 'two-digit year');
  assert.equal(parseFeedDate('Tue, 10 September 2024 09:00:00 GMT'), at9, 'full month name');
  assert.equal(parseFeedDate('Tue,  10 Sep 2024  09:00:00 +0000 (UTC)'), at9, 'extra spaces and a trailing comment');
  assert.equal(parseFeedDate('2024-09-10T09:00:00Z'), at9);
  assert.equal(parseFeedDate('2024-09-10T09:00:00'), at9, 'ISO without a zone → UTC');
  assert.equal(parseFeedDate('2024-09-10 17:00:00+08:00'), at9);
  assert.equal(parseFeedDate('2024-09-10T09:00:00.250Z'), at9 + 250);
  assert.equal(parseFeedDate('2024-09-10'), Date.UTC(2024, 8, 10));
  for (const bad of ['', '   ', 'sometime last Tuesday', '31 Feb 2024 09:00:00 GMT', '10 Foo 2024 09:00 GMT', '10 Sep 2024 09:00 XYZ', '2024-13-01', '10 Sep 2024 25:00 GMT', '10 Sep 2024 09:00 +2500']) {
    assert.equal(parseFeedDate(bad), undefined, bad);
  }
  assert.equal(parseFeedDate(undefined), undefined);
  assert.equal(parseFeedDate(null), undefined);
});

const node: MakeDecoder = (label, fatal) => new TextDecoder(label, { fatal });
/** Expo's native decoder: UTF-8 only, RangeError for every other label. */
const utf8Only: MakeDecoder = (label, fatal) => {
  if (normaliseCharset(label) !== 'utf-8') throw new RangeError(`Unknown encoding: ${label}`);
  return new TextDecoder('utf-8', { fatal });
};
const bytes = (...parts: (string | number[])[]) => new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? Array.from(p, (c) => c.charCodeAt(0)) : p)));
const GBK = [0xc4, 0xe3, 0xba, 0xc3]; // 你好

test('charset: header, XML declaration, BOM; a wrong UTF-8 header yields; unknown labels fall back', () => {
  assert.deepEqual(charsetHints('text/xml; charset="GB2312"', bytes('<?xml version="1.0" encoding=\'big5\'?>')), { header: 'gbk', xml: 'big5' });
  assert.deepEqual(charsetHints(null, bytes([0xef, 0xbb, 0xbf], '<rss/>')), { bom: 'utf-8' });
  assert.equal(normaliseCharset('ISO-8859-1'), 'windows-1252');
  assert.equal(normaliseCharset('Big5-HKSCS'), 'big5');
  assert.equal(normaliseCharset('GB18030'), 'gb18030');

  const gbkDecl = bytes('<?xml version="1.0" encoding="GBK"?><t>', GBK, '</t>');
  assert.equal(decodeFeedBytes(gbkDecl, 'text/xml', node), '<?xml version="1.0" encoding="GBK"?><t>你好</t>');
  assert.equal(decodeFeedBytes(gbkDecl, 'text/xml; charset=utf-8', node).includes('你好'), true, 'the declaration overrules a wrong UTF-8 header');
  const fallback = decodeFeedBytes(bytes('<t>', GBK, '</t>'), 'text/xml; charset=gbk', utf8Only);
  assert.ok(fallback.startsWith('<t>') && fallback.endsWith('</t>') && fallback.includes('�'), 'a UTF-8-only runtime falls back to UTF-8, never fails');
  assert.equal(decodeFeedBytes(bytes('<t>Caf', [0xe9], ' ', [0x93, 0x94], '</t>'), 'text/xml; charset=iso-8859-1', utf8Only), '<t>Café “”</t>', 'Latin-1 / 1252 by hand');
  assert.equal(decodeFeedBytes(bytes([0xef, 0xbb, 0xbf], '<t>é</t>'.replace('é', 'Ã©')), null, node), '<t>é</t>', 'BOM: UTF-8, mark removed');
  assert.equal(decodeFeedBytes(bytes('<t>x</t>'), 'text/xml; charset=klingon', node), '<t>x</t>', 'an unknown label → UTF-8');
  assert.equal(decodeWindows1252(bytes([0x81, 0x41])), '�A');
});

test('readCapped: the header, the stream and the text fallback all stop at the cap', async () => {
  const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });
  await assert.rejects(readCapped({ headers: headers({ 'content-length': '11' }), text: async () => 'x' }, 10), FeedTooLargeError);
  assert.deepEqual(await readCapped({ text: async () => 'short' }, 10), { text: 'short' });
  await assert.rejects(readCapped({ text: async () => 'x'.repeat(11) }, 10), FeedTooLargeError);
  assert.deepEqual(await readCapped({ arrayBuffer: async () => new Uint8Array([1, 2]).buffer, text: async () => '' }, 10), { bytes: new Uint8Array([1, 2]) });
  await assert.rejects(readCapped({ arrayBuffer: async () => new ArrayBuffer(11), text: async () => '' }, 10), FeedTooLargeError);

  let cancelled = false;
  let reads = 0;
  const endless = { getReader: () => ({ read: async () => { reads++; return { done: false, value: new Uint8Array(4) }; }, cancel: async () => { cancelled = true; } }) };
  await assert.rejects(readCapped({ body: endless, text: async () => '' }, 10), FeedTooLargeError);
  assert.equal(cancelled, true);
  assert.equal(reads, 3, 'stopped at the first chunk past the cap');

  const chunks = [new Uint8Array([60, 116]), new Uint8Array([62])];
  const finite = { getReader: () => ({ read: async () => (chunks.length ? { done: false, value: chunks.shift()! } : { done: true }), cancel: async () => undefined }) };
  assert.equal(await readFeedText({ body: finite, headers: headers({ 'content-type': 'text/xml' }), text: async () => '' }, node, 10), '<t>');
});

test('maxItems keeps the first N episodes; new-feed-url, block, person and funding are read', () => {
  const xml = fixture('moved-blocked.xml');
  const all = parseFeed(xml, 'https://old.example.com/feed.xml', { hash: id });
  assert.deepEqual(all.episodes.map((e) => e.guid), ['e3', 'e2', 'e1']);
  assert.deepEqual(parseFeed(xml, 'https://old.example.com/feed.xml', { hash: id, maxItems: 2 }).episodes.map((e) => e.guid), ['e3', 'e2']);
  assert.equal(all.episodes[0]!.publishedAt, Date.UTC(2024, 8, 12, 15), 'CST = -06:00');
  assert.equal(all.episodes[1]!.publishedAt, Date.UTC(2024, 8, 11, 9), 'zone-less ISO = UTC');

  assert.equal(all.show.newFeedUrl, 'https://new.example.com/feed.xml');
  assert.equal(all.show.blocked, true);
  assert.deepEqual(all.show.persons, [{ name: 'Ana', role: 'host', imageUrl: 'https://example.com/ana.jpg' }]);
  assert.deepEqual(all.show.funding, [{ url: 'https://example.com/tip', title: 'Buy us a coffee' }]);
  // The feed already at its new address does not point at itself.
  assert.equal(parseFeed(xml, 'https://new.example.com/feed.xml', { hash: id }).show.newFeedUrl, undefined);

  const real = parseFeed(fixture('real-podcasting20.xml'), 'https://example.com/feed.xml', { hash: id });
  assert.equal(real.show.blocked, undefined, 'only set when the feed asks');
  assert.deepEqual(real.show.funding, [{ url: 'https://example.com/donate', title: 'Support the show!' }]);
  const people = real.episodes[0]!.persons!;
  assert.equal(people.length, 3);
  assert.deepEqual(people[1], { name: 'Dave Jones', role: 'guest', href: 'https://github.com/daveajones/', imageUrl: 'https://example.com/images/davejones.jpg' });
  assert.equal(people[2]!.group, 'visuals');
});
