import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaKindOf } from '../src/media.ts';

test('the declared type decides; the extension only when the type says nothing', () => {
  assert.equal(mediaKindOf('video/mp4', 'https://cdn/x.mp3'), 'video');
  assert.equal(mediaKindOf(' VIDEO/quicktime ', 'https://cdn/x'), 'video');
  assert.equal(mediaKindOf('audio/mp4', 'https://cdn/x.mp4'), 'audio', 'an m4a-in-mp4 audio file is audio');
  assert.equal(mediaKindOf(undefined, 'https://cdn/x.mp4?token=1'), 'video');
  assert.equal(mediaKindOf('application/octet-stream', 'https://cdn/x.MOV'), 'video');
  assert.equal(mediaKindOf('', 'https://cdn/x.mp3'), 'audio');
  assert.equal(mediaKindOf(undefined, 'https://cdn/x.webm#t=1'), 'video');
});
