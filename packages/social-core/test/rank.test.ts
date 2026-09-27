/**
 * M8 (quickstart A3, A4, A5 · guards G-F1 and the fatigue rule) — the combined score.
 *
 * The one that matters most is A4. A podcast feed with no `<pubDate>` is common, and if a
 * missing date were treated as "now" every episode of every undated feed would look
 * brand new for ever and would own the list. It is scored as a week old instead.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageDays, FATIGUE_LIMIT, isFatigued, NEW_BOOST, scoreCandidate, UNDATED_AGE_DAYS, type RecCandidate } from '../src/rank.ts';

const NOW = Date.parse('2026-09-25T12:00:00Z');
const DAY = 86_400_000;

const base: RecCandidate = {
  episodeId: 'e', feedUrl: 'https://f/x', genreId: 1318, channel: 'talked',
  publishedAt: NOW - 30 * DAY, subscribed: false, neighbourSim: 0, genreMatch: false,
  socialCount: 0, talkedScore: 0, impressions: 0,
};
const c = (o: Partial<RecCandidate> = {}): RecCandidate => ({ ...base, ...o });

test('A3: fresh beats old at equal popularity, and under 48 h it also carries the boost', () => {
  const old = c({ publishedAt: NOW - 30 * DAY, talkedScore: 20 });
  const fresh = c({ publishedAt: NOW - 6 * 3_600_000, talkedScore: 20 });
  assert.ok(scoreCandidate(fresh, NOW) > scoreCandidate(old, NOW));

  // Isolate the boost: same age, one inside the window and one just outside.
  const inside = c({ publishedAt: NOW - 47 * 3_600_000 });
  const outside = c({ publishedAt: NOW - 49 * 3_600_000 });
  const ratio = scoreCandidate(inside, NOW) / scoreCandidate(outside, NOW);
  assert.ok(ratio > 1.15 && ratio < NEW_BOOST + 0.1, `expected roughly ×${NEW_BOOST}, got ×${ratio.toFixed(3)}`);
});

test('A4 (G-F1): no publish date is scored as a week old, NOT as new', () => {
  assert.equal(ageDays(null, NOW), UNDATED_AGE_DAYS);
  const undated = c({ publishedAt: null });
  const weekOld = c({ publishedAt: NOW - UNDATED_AGE_DAYS * DAY });
  assert.equal(scoreCandidate(undated, NOW).toFixed(6), scoreCandidate(weekOld, NOW).toFixed(6));
  // And it must not collect the new-episode boost.
  const hourOld = c({ publishedAt: NOW - 3_600_000 });
  assert.ok(scoreCandidate(undated, NOW) < scoreCandidate(hourOld, NOW));
});

test('a date in the future is not fresher than now', () => {
  assert.equal(ageDays(NOW + 5 * DAY, NOW), 0);
  assert.equal(ageDays(NOW, NOW), 0);
});

test('A5: three impressions with no open is fatigued; two is not', () => {
  // The numbers are LITERAL on purpose. Written as `FATIGUE_LIMIT - 1` / `FATIGUE_LIMIT`
  // this test self-adjusts to whatever the constant says and can never go red — which is
  // exactly what happened when the guard was first broken on 2026-09-25: raising
  // FATIGUE_LIMIT to 99 left it passing. A guard that cannot fail is not a guard.
  assert.equal(FATIGUE_LIMIT, 3, 'FR-017 says three');
  assert.equal(isFatigued(c({ impressions: 2 })), false);
  assert.equal(isFatigued(c({ impressions: 3 })), true);
  assert.equal(isFatigued(c({ impressions: 8 })), true);
  // And it costs score before it costs a place.
  assert.ok(scoreCandidate(c({ impressions: 2 }), NOW) < scoreCandidate(c({ impressions: 0 }), NOW));
  assert.equal(
    scoreCandidate(c({ impressions: 3 }), NOW),
    scoreCandidate(c({ impressions: 12 }), NOW),
    'the penalty is capped, so it cannot swamp everything else',
  );
});

test('affinity: subscribed beats a strong neighbour beats a category match beats nothing', () => {
  const subscribed = scoreCandidate(c({ subscribed: true }), NOW);
  const neighbour = scoreCandidate(c({ neighbourSim: 0.8 }), NOW);
  const genre = scoreCandidate(c({ genreMatch: true }), NOW);
  const nothing = scoreCandidate(c(), NOW);
  assert.ok(subscribed > neighbour && neighbour > genre && genre > nothing);
  // A weak neighbour does not beat a category match — the stronger of the two is used.
  assert.equal(scoreCandidate(c({ neighbourSim: 0.1, genreMatch: true }), NOW), genre);
  // Being subscribed wins outright, whatever the rest says.
  assert.equal(scoreCandidate(c({ subscribed: true, neighbourSim: 1, genreMatch: true }), NOW), subscribed);
});

test('social and quality saturate rather than running away', () => {
  const none = scoreCandidate(c(), NOW);
  const few = scoreCandidate(c({ socialCount: 2 }), NOW);
  const many = scoreCandidate(c({ socialCount: 400 }), NOW);
  assert.ok(few > none);
  assert.equal(many, scoreCandidate(c({ socialCount: 4000 }), NOW), 'capped at 1');

  assert.ok(scoreCandidate(c({ talkedScore: 10 }), NOW) > none);
  assert.equal(scoreCandidate(c({ talkedScore: 5000 }), NOW), scoreCandidate(c({ talkedScore: 100_000 }), NOW), 'capped at 1');
  assert.equal(scoreCandidate(c({ talkedScore: -5 }), NOW), none, 'a negative score cannot exist, and cannot subtract if it does');
});

test('the boost multiplies the positive part only — a tired new episode is not pushed further down by it', () => {
  const tiredNew = c({ publishedAt: NOW - 3_600_000, impressions: 2 });
  const tiredOld = c({ publishedAt: NOW - 20 * DAY, impressions: 2 });
  assert.ok(scoreCandidate(tiredNew, NOW) > scoreCandidate(tiredOld, NOW), 'the boost still helps something with a penalty');
});
