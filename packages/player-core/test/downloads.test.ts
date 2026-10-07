// Tests the storage limit counts in-progress downloads and the download order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canStartDownload, nextDownload, usedBytesOf } from '../src/downloads.ts';
import type { DownloadCandidate } from '../src/types.ts';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

// quickstart A7 — guard G7
test('A7: 1.9 GB used (incl. 200 MB in flight) + 200 MB new does not fit a 2 GB budget', () => {
  const used = usedBytesOf([
    { state: 'complete', bytesTotal: 1.7 * GB },
    { state: 'downloading', bytesTotal: 200 * MB, bytesDone: 50 * MB },
    { state: 'waiting' },
  ]);
  assert.equal(used, 1.7 * GB + 200 * MB);
  assert.equal(usedBytesOf([{ state: 'complete' }, { state: 'downloading', bytesDone: 5 }, { state: 'downloading' }]), 5, 'unknown totals count what is known');
  assert.equal(canStartDownload(used, 200 * MB, 2 * GB), false);
  assert.equal(canStartDownload(1.7 * GB, 200 * MB, 2 * GB), true);
  assert.equal(canStartDownload(0, undefined, 2 * GB), true, 'unknown size: only used bytes are checked');
  assert.equal(canStartDownload(0, 1, 0), false, 'no budget, no download');
});

// M23 T044 — guard G-M23-9
test('G-M23-9: a paused, half-finished download counts against the budget', () => {
  const used = usedBytesOf([
    { state: 'complete', bytesTotal: 1.7 * GB },
    { state: 'paused', bytesTotal: 200 * MB, bytesDone: 100 * MB },
  ]);
  assert.equal(used, 1.7 * GB + 200 * MB, 'a paused row holds its full size');
  assert.equal(canStartDownload(used, 200 * MB, 2 * GB), false, 'so a new 200 MB download does not fit');
  assert.equal(usedBytesOf([{ state: 'paused', bytesDone: 7 }, { state: 'paused' }]), 7, 'unknown total: what is on the phone');
  assert.equal(usedBytesOf([{ state: 'waiting', bytesTotal: 9 }, { state: 'failed', bytesTotal: 9 }]), 0, 'waiting and failed hold nothing');
});

const c = (episodeId: string, over: Partial<DownloadCandidate> = {}): DownloadCandidate =>
  ({ episodeId, state: 'waiting', requestedAt: 1, allowMobile: false, ...over });

test('one at a time, earliest requested first, Wi-Fi rule, offline nothing', () => {
  const rows = [c('b', { requestedAt: 2 }), c('a', { requestedAt: 1 })];
  assert.equal(nextDownload(rows, 'wifi', false), 'a');
  assert.equal(nextDownload([...rows, c('x', { state: 'downloading' })], 'wifi', false), undefined, 'something already downloading');
  assert.equal(nextDownload(rows, 'cellular', false), undefined, 'cellular without permission');
  assert.equal(nextDownload([c('m', { allowMobile: true, requestedAt: 5 }), ...rows], 'cellular', false), 'm', 'per-download override');
  assert.equal(nextDownload(rows, 'cellular', true), 'a', 'global override');
  assert.equal(nextDownload(rows, 'none', true), undefined);
  assert.equal(nextDownload([c('p', { state: 'paused' })], 'wifi', false), 'p', 'a paused row resumes');
  assert.equal(nextDownload([c('d', { state: 'complete' }), c('f', { state: 'failed' })], 'wifi', false), undefined);
});
