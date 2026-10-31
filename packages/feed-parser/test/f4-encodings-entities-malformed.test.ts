// Tests the F4 edge cases: GBK and Big5 feeds, entity-heavy feeds, and malformed feeds that must never throw.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { decodeFeedBytes, type MakeDecoder } from '../src/body';
import { parseFeed } from '../src/parse-feed';

const raw = (name: string): Uint8Array => new Uint8Array(readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))));
const node: MakeDecoder = (label, fatal) => new TextDecoder(label, { fatal });
const hash = (s: string): string => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(16, '0');
};
const FEED = 'https://feeds.example.com/f.xml';
const parse = (xml: string) => parseFeed(xml, FEED, { hash });

test('GBK feed: declared in the prolog (no HTTP charset) and by the HTTP charset, titles and fields are Chinese text', () => {
  for (const ct of [null, 'text/xml', 'application/rss+xml; charset=gb2312']) {
    const feed = parse(decodeFeedBytes(raw('gbk.xml'), ct, node));
    assert.equal(feed.show.title, '你好，世界播客');
    assert.equal(feed.show.author, '小明');
    assert.equal(feed.show.description, '每周聊聊科技与生活');
    assert.deepEqual(feed.episodes.map((e) => e.title), ['第一期：你好', '第二期：再见']);
    assert.deepEqual(feed.episodes.map((e) => e.guid), ['ep-1', 'ep-2']);
    assert.deepEqual(feed.episodes.map((e) => e.durationMs), [3_723_000, 2_710_000]);
    assert.equal(feed.episodes[0]!.enclosureUrl, 'https://cdn.example.com/1.mp3');
  }
  // A server that wrongly says UTF-8: the prolog still wins.
  assert.equal(parse(decodeFeedBytes(raw('gbk.xml'), 'text/xml; charset=utf-8', node)).show.title, '你好，世界播客');
});

test('Big5 feed: prolog and HTTP charset both decode traditional characters', () => {
  for (const ct of [null, 'text/xml; charset=big5']) {
    const feed = parse(decodeFeedBytes(raw('big5.xml'), ct, node));
    assert.equal(feed.show.title, '你好，世界播客');
    assert.equal(feed.show.description, '每週聊聊科技與生活');
    assert.deepEqual(feed.episodes.map((e) => e.title), ['第一期：你好', '第二期：再見']);
    assert.equal(feed.episodes[1]!.durationMs, 2_710_000);
  }
});

const wrap = (items: string, extra = ''): string =>
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>T</title>${extra}${items}</channel></rss>`;
const enc = (n: number): string => `<enclosure url="https://cdn.example.com/${n}.mp3" type="audio/mpeg" length="5"/>`;

test('entities: numeric, named, CDATA, double-escaped and HTML descriptions', () => {
  const xml = wrap(
    `<item><title>Tom &amp; Jerry &#8211; &#x4F60;&#22909; &lt;3 &quot;q&quot;</title><guid>a&amp;b</guid>${enc(1)}
       <description><![CDATA[<p>Hello <b>world</b> & more</p>]]></description></item>
     <item><title>Escaped &amp;amp; twice</title><guid>g2</guid>${enc(2)}
       <description>&lt;p&gt;Escaped &lt;i&gt;html&lt;/i&gt;&lt;/p&gt;</description></item>
     <item><title><![CDATA[CDATA & <title>]]></title><guid>g3</guid>${enc(3)}<content:encoded><![CDATA[<h1>Full</h1>]]></content:encoded><description>short</description></item>`,
    `<description>Show &amp; tell &#169; &#x2603;</description>`,
  );
  const feed = parse(xml);
  assert.equal(feed.show.description, 'Show & tell © ☃');
  const [a, b, c] = feed.episodes;
  assert.equal(a!.title, 'Tom & Jerry – 你好 <3 "q"');
  assert.equal(a!.guid, 'a&b', 'the guid is the decoded text');
  assert.equal(a!.shownotesHtml, '<p>Hello <b>world</b> & more</p>', 'CDATA is kept as the HTML it holds');
  assert.equal(b!.title, 'Escaped &amp; twice', 'a double-escaped &amp;amp; decodes once only, not twice');
  assert.equal(b!.shownotesHtml, '<p>Escaped <i>html</i></p>');
  assert.equal(c!.title, 'CDATA & <title>');
  assert.equal(c!.shownotesHtml, '<h1>Full</h1>', 'content:encoded wins over description');
});

test('malformed: garbage, empty and truncated input never throws and never invents episodes', () => {
  const garbage = ['', ' ', 'not xml at all', '<', '<rss', '<rss><channel>', '\u0000\u0001\u0002', '<?xml version="1.0"?>', '{"json":true}', '<html><body>502 Bad Gateway</body></html>', '<rss><channel><item><title>x</title></item></channel></rss>'];
  for (const g of garbage) {
    const feed = parse(g);
    assert.deepEqual(feed.episodes, [], JSON.stringify(g));
  }
  assert.equal(parse('<html/>').warnings[0]!.code, 'not-rss');
});

test('malformed: truncated mid-item keeps the complete items or fails soft, never throws', () => {
  const full = wrap(`<item><title>One</title><guid>1</guid>${enc(1)}</item><item><title>Two</title><guid>2</guid>${enc(2)}</item>`);
  for (let cut = 0; cut < full.length; cut += 7) {
    const feed = parse(full.slice(0, cut)); // must not throw at any cut point
    for (const e of feed.episodes) assert.ok(e.guid && e.enclosureUrl.startsWith('https://'), `cut ${cut}`);
  }
  const cutMid = full.slice(0, full.indexOf('<item><title>Two') + 20);
  const got = parse(cutMid);
  assert.ok(got.episodes.length <= 1);
  assert.ok(got.episodes.every((e) => e.title === 'One'));
});

test('malformed: BOM, unclosed tags, bad dates and durations, missing enclosure, duplicate and missing guids', () => {
  const xml = '﻿' + wrap(
    `<item><title>Good</title><guid>g1</guid><pubDate>Tue, 10 Sep 2024 09:00:00 GMT</pubDate><itunes:duration>10:00</itunes:duration>${enc(1)}</item>
     <item><title>Bad date</title><guid>g2</guid><pubDate>last Tuesday-ish</pubDate><itunes:duration>forever</itunes:duration>${enc(2)}</item>
     <item><title>No enclosure</title><guid>g3</guid></item>
     <item><title>Dup</title><guid>g1</guid>${enc(4)}</item>
     <item><title>No guid</title>${enc(5)}</item>
     <item><title>Empty enclosure url</title><guid>g6</guid><enclosure url="" type="audio/mpeg"/></item>`,
  );
  const feed = parse(xml);
  assert.equal(feed.show.title, 'T', 'a BOM does not hide the channel');
  assert.deepEqual(feed.episodes.map((e) => e.guid), ['g1', 'g2', 'https://cdn.example.com/5.mp3']);
  assert.equal(feed.episodes[0]!.durationMs, 600_000);
  assert.equal(feed.episodes[1]!.publishedAt, undefined);
  assert.equal(feed.episodes[1]!.durationMs, undefined);
  assert.equal(feed.episodes[2]!.guidSource, 'enclosure');
  const codes = feed.warnings.map((w) => w.code);
  for (const c of ['unparsable-date', 'unparsable-duration', 'item-without-enclosure', 'duplicate-guid', 'missing-guid'] as const) assert.ok(codes.includes(c), c);
  assert.equal(feed.episodes.find((e) => e.guid === 'g1')!.title, 'Good', 'first of a duplicated guid wins');
});

test('malformed: tags left unclosed do not throw', () => {
  const xml = '<rss><channel><title>Open<item><title>x</title><enclosure url="https://c.example.com/1.mp3"/></item></channel></rss>';
  assert.doesNotThrow(() => parse(xml));
});
