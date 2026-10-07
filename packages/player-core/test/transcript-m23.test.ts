// Tests the M23 transcript changes: VTT speakers, shape detection, entities, sorting, binary search.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentLine, decodeEntities, parseTranscript } from '../src/transcript.ts';

test('US11: VTT <v Name> gives the speaker; the "Name:" guess is SRT-only', () => {
  const vtt = 'WEBVTT\n\n00:00.000 --> 00:02.000\n<v Bob>Hi <b>there</b></v>\n\n00:02.000 --> 00:03.000\n<v.loud Ann Lee>Hey\n\n00:03.000 --> 00:04.000\nNote: this is not a speaker';
  const v = parseTranscript(vtt, 'text/vtt');
  assert.ok('lines' in v);
  assert.deepEqual(v.lines, [
    { startMs: 0, endMs: 2_000, speaker: 'Bob', text: 'Hi there' },
    { startMs: 2_000, endMs: 3_000, speaker: 'Ann Lee', text: 'Hey' },
    { startMs: 3_000, endMs: 4_000, text: 'Note: this is not a speaker' },
  ]);
  const srt = parseTranscript('1\n00:00:01,000 --> 00:00:02,000\nAlice: Hello', 'application/srt');
  assert.ok('lines' in srt);
  assert.deepEqual(srt.lines, [{ startMs: 1_000, endMs: 2_000, speaker: 'Alice', text: 'Hello' }]);
});

test('US11: the body decides — SRT or VTT served as text/plain (or under the wrong label) is read as timed', () => {
  const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nOne\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nTwo';
  const s = parseTranscript(srt, 'text/plain');
  assert.ok('lines' in s);
  assert.deepEqual(s.lines.map((l) => l.text), ['One', 'Two']);
  const v = parseTranscript('﻿WEBVTT\n\n00:01.000 --> 00:02.000\nHi', 'application/srt');
  assert.ok('lines' in v);
  assert.deepEqual(v.lines, [{ startMs: 1_000, endMs: 2_000, text: 'Hi' }]);
  assert.deepEqual(parseTranscript('Just words. 1 2 3.', 'text/plain'), { text: 'Just words. 1 2 3.' });
  assert.deepEqual(parseTranscript('WEBVTTX is not a header', 'text/plain'), { text: 'WEBVTTX is not a header' });
  // A body with no recognisable shape still follows its label (a VTT missing its header line).
  assert.deepEqual(parseTranscript('00:01.000 --> 00:02.000\n<v A>x', 'text/vtt'), { lines: [{ startMs: 1_000, endMs: 2_000, speaker: 'A', text: 'x' }] });
});

test('US11: entities are decoded, in cues and in HTML', () => {
  const v = parseTranscript('WEBVTT\n\n00:00.000 --> 00:01.000\nTom &amp; Jerry &lt;3 &#8217;s &#x4f60; &unknown;', 'text/vtt');
  assert.ok('lines' in v);
  assert.equal(v.lines[0]!.text, 'Tom & Jerry <3 ’s 你 &unknown;');
  assert.deepEqual(parseTranscript('<p>&quot;Hi&quot; &apos;there&apos;&nbsp;&#0;</p>', 'text/html'), { text: '"Hi" \'there\' &#0;' });
  assert.equal(decodeEntities('&AMP; &#x110000; &#65;'), '& &#x110000; A');
});

test('US11: lines are sorted by start, and currentLine is a binary search over them', () => {
  const srt = '2\n00:00:05,000 --> 00:00:06,000\nSecond\n\n1\n00:00:01,000 --> 00:00:02,000\nFirst\n\n3\n00:00:09,000 --> 00:00:10,000\nThird';
  const s = parseTranscript(srt, 'application/srt');
  assert.ok('lines' in s);
  assert.deepEqual(s.lines.map((l) => l.text), ['First', 'Second', 'Third']);
  const j = parseTranscript(JSON.stringify({ segments: [{ startTime: 2, body: 'b' }, { startTime: 1, body: 'a' }] }), 'application/json');
  assert.ok('lines' in j);
  assert.deepEqual(j.lines.map((l) => l.text), ['a', 'b']);

  const lines = Array.from({ length: 10_000 }, (_, i) => ({ startMs: i * 1_000, text: String(i) }));
  assert.equal(currentLine(lines, -1), undefined);
  assert.equal(currentLine(lines, 0), 0);
  assert.equal(currentLine(lines, 4_321_999), 4_321);
  assert.equal(currentLine(lines, 4_322_000), 4_322);
  assert.equal(currentLine(lines, 1e12), 9_999);
  assert.equal(currentLine([], 5), undefined);
});
