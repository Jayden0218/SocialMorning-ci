import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentChapter, parseChapters } from '../src/chapters.ts';
import { currentLine, parseTranscript } from '../src/transcript.ts';

// quickstart A8
test('A8: chapters — seconds → ms, missing titles kept as undefined, endTime, toc:false skipped, bad entries skipped, sorted', () => {
  const ch = parseChapters({
    version: '1.2.0',
    chapters: [
      { startTime: 300, title: 'Two' },
      { startTime: 0, title: 'One', endTime: 299.5, img: 'https://i/1.png', url: 'https://x' },
      { startTime: 'nope', title: 'bad' },
      { startTime: 600 },
      { startTime: 900, title: 'hidden', toc: false },
      null,
    ],
  });
  assert.deepEqual(ch, [
    { startMs: 0, endMs: 299_500, title: 'One', imageUrl: 'https://i/1.png', url: 'https://x' },
    { startMs: 300_000, title: 'Two' },
    { startMs: 600_000 },
  ]);
  assert.deepEqual(parseChapters({ nope: 1 }), []);
  assert.deepEqual(parseChapters(null), []);
  assert.equal(currentChapter(ch, 0), 0);
  assert.equal(currentChapter(ch, 299_999), 0);
  assert.equal(currentChapter(ch, 300_000), 1);
  assert.equal(currentChapter(ch, 1e9), 2);
  assert.equal(currentChapter([{ startMs: 5_000 }], 1_000), undefined);
});

// quickstart A6 — guard G6
test('A6: SRT with a malformed second block keeps the other two; VTT; JSON segments; HTML → text', () => {
  const srt = `1\n00:00:01,000 --> 00:00:04,000\nHello there\n\n2\nthis block has no timing\n\n3\n00:01:00,500 --> 00:01:02,000\nAlice: Still here`;
  const s = parseTranscript(srt, 'application/srt');
  assert.ok('lines' in s);
  assert.deepEqual(s.lines, [
    { startMs: 1_000, endMs: 4_000, text: 'Hello there' },
    { startMs: 60_500, endMs: 62_000, speaker: 'Alice', text: 'Still here' },
  ]);

  const vtt = `WEBVTT\n\n00:00.000 --> 00:02.500\n<v Bob>Hi <b>bold</b>\n\n00:03.000 --> 00:04.000 line:0\nSecond`;
  const v = parseTranscript(vtt, 'text/vtt; charset=utf-8');
  assert.ok('lines' in v);
  assert.deepEqual(v.lines.map((l) => [l.startMs, l.endMs, l.text]), [[0, 2_500, 'Hi bold'], [3_000, 4_000, 'Second']]);

  const j = parseTranscript(JSON.stringify({ version: '1.0.0', segments: [{ startTime: 0.5, endTime: 2.1, speaker: 'A', body: 'yo' }, { startTime: 'x', body: 'bad' }, { startTime: 3, body: '  ' }] }), 'application/json');
  assert.ok('lines' in j);
  assert.deepEqual(j.lines, [{ startMs: 500, endMs: 2_100, speaker: 'A', text: 'yo' }]);

  const h = parseTranscript('<p>Hello &amp; <b>world</b></p><p>Bye</p>', 'text/html');
  assert.deepEqual(h, { text: 'Hello & world\nBye' });
  assert.deepEqual(parseTranscript('plain', 'text/plain'), { text: 'plain' });
  assert.deepEqual(parseTranscript('{not json', 'application/json'), { text: '{not json' });
  assert.deepEqual(parseTranscript('{"a":1}', 'application/json'), { text: '{"a":1}' });
});

test('cue edge cases: unparsable start skipped, unparsable end → no endMs, empty body skipped, blank blocks ignored, no speaker/endTime in JSON', () => {
  const srt = `\n\n1\nabc --> def\nno times\n\n2\n00:00:01,000 --> junk\nOnly start\n\n3\n00:00:02,000 --> 00:00:03,000\n\n\n\n`;
  const s = parseTranscript(srt, 'application/x-subrip');
  assert.ok('lines' in s);
  assert.deepEqual(s.lines, [{ startMs: 1_000, text: 'Only start' }]);
  const j = parseTranscript(JSON.stringify({ segments: [{ startTime: 1, body: 'x', speaker: '' }, { startTime: 2, body: 'y', speaker: 7 }] }), 'application/json');
  assert.ok('lines' in j);
  assert.deepEqual(j.lines, [{ startMs: 1_000, text: 'x' }, { startMs: 2_000, text: 'y' }]);
  assert.deepEqual(parseTranscript('WEBVTT\n\n', 'text/vtt'), { lines: [] });
});

test('currentLine follows playback', () => {
  const lines = [{ startMs: 0, text: 'a' }, { startMs: 5_000, text: 'b' }];
  assert.equal(currentLine(lines, 4_999), 0);
  assert.equal(currentLine(lines, 5_000), 1);
  assert.equal(currentLine([{ startMs: 9, text: 'x' }], 1), undefined);
});
