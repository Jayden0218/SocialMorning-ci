import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enoughNextUp, nextUp, REASON_LABEL, type Candidate } from '../src/nextup.ts';

const c = (key: string, reason: Candidate['reason']) => ({ key, reason });
const sources = (over: Partial<Record<Candidate['reason'], Candidate[]>> = {}) => ({
  alsoListened: [], talkedAboutOnShow: [], newOnShow: [], trendingInCategory: [], ...over,
});

test('A4: the same episode in alsoListened and trending appears once, with alsoListened (G4); the current + a finished one never appear (G3)', () => {
  const out = nextUp(sources({
    alsoListened: [c('current', 'alsoListened'), c('x', 'alsoListened'), c('finished', 'alsoListened')],
    talkedAboutOnShow: [c('y', 'talkedAboutOnShow'), c('x', 'talkedAboutOnShow')],
    newOnShow: [c('finished', 'newOnShow'), c('z', 'newOnShow')],
    trendingInCategory: [c('x', 'trendingInCategory'), c('w', 'trendingInCategory')],
  }), new Set(['current', 'finished']));
  assert.deepEqual(out, [c('x', 'alsoListened'), c('y', 'talkedAboutOnShow'), c('z', 'newOnShow'), c('w', 'trendingInCategory')]);
});

test('A4: cap 8 stops early; the lower sources fill when the stronger ones are short; too few is reported, not padded', () => {
  const many = (reason: Candidate['reason'], n: number, prefix: string) => Array.from({ length: n }, (_, i) => c(`${prefix}${i}`, reason));
  const capped = nextUp(sources({ alsoListened: many('alsoListened', 6, 'a'), talkedAboutOnShow: many('talkedAboutOnShow', 6, 't') }), new Set());
  assert.equal(capped.length, 8);
  assert.deepEqual(capped.slice(6).map((x) => x.key), ['t0', 't1']);
  const short = nextUp(sources({ trendingInCategory: many('trendingInCategory', 2, 'r') }), new Set());
  assert.equal(short.length, 2);
  assert.equal(enoughNextUp(short), false);
  assert.equal(enoughNextUp(capped), true);
  assert.equal(nextUp(sources(), new Set(), 3).length, 0);
  assert.equal(REASON_LABEL.alsoListened, 'People who listened to this also listened');
});
