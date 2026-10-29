// Tests the player page's sums: the state selectors, hot moments, the speed dial's angles, the sleep clock, the status line, the now bar's signals.
/**
 * M31 T024. Pure, so no renderer: the selectors added to `src/playback/store.ts` (every branch — that folder
 * keeps 100 % branch coverage), `hot.ts` (the next-hot-moment pill and the heat re-cut onto the player's
 * length), `dial-math.ts` (26 ticks on 270°, a touch turned into a rate, the clock's six circles), the status
 * line, the pin colours, the ring's size, the glow pair, the queue deck's drag target, and the now bar's
 * signals (a page says Moments / scrolled / sheet; the bar listens).
 *
 * The break that turns it red: change `HOT_MIN` to 0.9, flip the sign in `tickAngle`, or drop the `?? 0` in
 * `playerPositionMs`.
 */

// The parts under test live in files that import the app's contexts; only their pure sums are used here.
jest.mock('@/ui/shell/providers', () => ({}));
jest.mock('@/social/context', () => ({}));
jest.mock('@/social/live', () => ({}));
jest.mock('@/ui/show/ShowExtras', () => ({}));
jest.mock('@/ui/queue/QueueSheetHost', () => ({}));
import {
  playerDurationMs, playerPositionMs, sameClock, sameHead, selectClock, selectEpisodeId, selectHead, selectIdle, selectIsPlaying,
} from '@/playback/store';
import type { PlayerState } from '@/playback/types';
import { alignHeat, hotMoments, hotNow, hotPillText, nextHot } from '@/ui/player/hot';
import { CLOCK_MINUTES, DIAL_TICKS, clockPoint, dialFraction, elapsedShare, isBigTick, knobPoint, tickAngle, tickRate, ticks } from '@/ui/player/dial-math';
import { statusLine } from '@/ui/player/PlayerTitleBlock';
import { pinColour } from '@/ui/player/PlayerRing';
import { glowPair } from '@/ui/player/PlayerBackdrop';
import { PLAYER, ringSize } from '@/ui/player/measures';
import { CARD_PITCH, dragTarget } from '@/ui/player/QueueDeck';
import { chapterProgress } from '@/ui/player/ChapterList';
import { moonA11y, moonLabel } from '@/ui/player/MoonButton';
import { colour } from '@/design';
import { mmss } from '@/ui/kit/format';

const idle: PlayerState = { kind: 'idle' };
const loading: PlayerState = { kind: 'loading', episodeId: 'e1', loadId: 1, intent: 'play', positionMs: 1000, url: 'u' };
const playing: PlayerState = { kind: 'playing', episodeId: 'e1', positionMs: 5_900, durationMs: 60_000, lastSavedMs: 0 };
const paused: PlayerState = { kind: 'paused', episodeId: 'e1', positionMs: 7000, by: 'output-lost' };
const ended: PlayerState = { kind: 'ended', episodeId: 'e1', durationMs: 60_000 };
const endedNoLength: PlayerState = { kind: 'ended', episodeId: 'e1' };
const failedNoEpisode: PlayerState = { kind: 'error', message: 'x' };
const failedNoPosition = { kind: 'error', episodeId: 'e1', message: 'x', positionMs: undefined } as unknown as PlayerState;

describe('the state selectors (src/playback/store.ts)', () => {
  it('selectHead: which page to draw — never the position', () => {
    expect(selectHead(idle)).toEqual({ kind: 'idle', episodeId: undefined, message: undefined, by: undefined });
    expect(selectHead(playing)).toEqual({ kind: 'playing', episodeId: 'e1', message: undefined, by: undefined });
    expect(selectHead(paused)).toEqual({ kind: 'paused', episodeId: 'e1', message: undefined, by: 'output-lost' });
    expect(selectHead(failedNoEpisode)).toEqual({ kind: 'error', episodeId: undefined, message: 'x', by: undefined });
    expect(selectHead(loading).episodeId).toBe('e1');
  });

  it('sameHead compares every field, so a tick is "the same" and a pause is not', () => {
    const a = selectHead(playing);
    expect(sameHead(a, selectHead({ ...playing, positionMs: 9_000 } as PlayerState))).toBe(true);
    expect(sameHead(a, { ...a, kind: 'paused' })).toBe(false);
    expect(sameHead(a, { ...a, episodeId: 'e2' })).toBe(false);
    expect(sameHead(a, { ...a, message: 'm' })).toBe(false);
    expect(sameHead(a, { ...a, by: 'user' })).toBe(false);
  });

  it('the small ones', () => {
    expect(selectEpisodeId(idle)).toBeUndefined();
    expect(selectEpisodeId(loading)).toBe('e1');
    expect(selectIdle(idle)).toBe(true);
    expect(selectIdle(playing)).toBe(false);
    expect(selectIsPlaying(playing)).toBe(true);
    expect(selectIsPlaying({ ...playing, kind: 'buffering' } as PlayerState)).toBe(true);
    expect(selectIsPlaying(paused)).toBe(false);
  });

  it('playerPositionMs: the position, the length at the end, 0 when there is none', () => {
    expect(playerPositionMs(playing)).toBe(5_900);
    expect(playerPositionMs(ended)).toBe(60_000);
    expect(playerPositionMs(endedNoLength)).toBe(0);
    expect(playerPositionMs(idle)).toBe(0);
    expect(playerPositionMs(failedNoPosition)).toBe(0);
  });

  it('playerDurationMs, and the clock rounded DOWN to the second so only a changed second redraws', () => {
    expect(playerDurationMs(playing)).toBe(60_000);
    expect(playerDurationMs(idle)).toBeUndefined();
    expect(selectClock(playing)).toEqual({ positionMs: 5_000, durationMs: 60_000 });
    expect(selectClock(idle)).toEqual({ positionMs: 0, durationMs: undefined });
    const a = selectClock(playing);
    expect(sameClock(a, selectClock({ ...playing, positionMs: 5_999 } as PlayerState))).toBe(true);
    expect(sameClock(a, selectClock({ ...playing, positionMs: 6_000 } as PlayerState))).toBe(false);
    expect(sameClock(a, { ...a, durationMs: 61_000 })).toBe(false);
  });
});

describe('hot moments (the next-hot-moment pill)', () => {
  const flat = Array.from({ length: 100 }, () => 0.1);
  const heat = flat.map((v, i) => (i === 40 || i === 41 ? 1 : i === 70 ? 0.8 : v));

  it('finds the runs of the tallest bars; neighbours are one moment; a flat curve has none', () => {
    const m = hotMoments(heat, 600_000);
    expect(m).toEqual([{ fromMs: 240_000, toMs: 252_000 }, { fromMs: 420_000, toMs: 426_000 }]);
    expect(hotMoments(flat, 600_000)).toEqual([]);
    expect(hotMoments(Array.from({ length: 100 }, () => 0), 600_000)).toEqual([]);
    expect(hotMoments(undefined, 600_000)).toEqual([]);
    expect(hotMoments([], 600_000)).toEqual([]);
    expect(hotMoments(heat, undefined)).toEqual([]);
  });

  it('only a peak at least 40 % as tall as the tallest counts', () => {
    const lone = flat.map((v, i) => (i === 10 ? 1 : i === 20 ? 0.3 : v));
    expect(hotMoments(lone, 100_000).map((x) => x.fromMs)).toEqual([10_000]);
  });

  it('now / next / the pill words', () => {
    const m = hotMoments(heat, 600_000);
    expect(hotNow(m, 245_000)).toEqual(m[0]);
    expect(hotNow(m, 100_000)).toBeUndefined();
    expect(nextHot(m, 100_000)).toEqual(m[0]);
    expect(nextHot(m, 300_000)).toEqual(m[1]);
    expect(nextHot(m, 500_000)).toBeUndefined();
    expect(hotPillText(m, 120_000, mmss)).toBe('next hot moment in 2:00');
    expect(hotPillText(m, 245_000, mmss)).toBe('hot right now');
    expect(hotPillText(m, 500_000, mmss)).toBeUndefined();
  });

  it('alignHeat: the server\'s 100 buckets re-cut onto the player\'s own length', () => {
    const b = Array.from({ length: 100 }, (_, i) => i / 100);
    expect(alignHeat(undefined, 600_000, 600_000)).toEqual(Array.from({ length: 100 }, () => 0));
    expect(alignHeat([], 600_000, 600_000)).toEqual(Array.from({ length: 100 }, () => 0));
    expect(alignHeat(b, 600_000, 600_000)).toEqual(b);
    expect(alignHeat(b, 600_000, 600_500)).toEqual(b); // under a second apart: the same axis
    expect(alignHeat(b, undefined, 600_000)).toEqual(b);
    // The feed said 50:49 but the audio is 48:19: bucket i is drawn under the time it describes.
    const long = alignHeat(b, 3049_000, 2899_000);
    expect(long).toHaveLength(100);
    expect(long[0]).toBeCloseTo(0, 1);
    expect(long[99]).toBeGreaterThan(0.9);
    // The audio is longer than the feed said: the end of the ring is flat.
    const short = alignHeat(b, 300_000, 600_000);
    expect(short[0]).toBeCloseTo(0, 1);
    expect(short[60]).toBe(0);
  });
});

describe('the speed dial and the sleep clock', () => {
  it('26 ticks from 0.5× to 3.0× over 270°, from 135°; whole and half rates are long', () => {
    expect(DIAL_TICKS).toBe(26);
    expect(tickAngle(0)).toBe(135);
    expect(tickAngle(25)).toBe(405);
    expect(tickRate(0)).toBe(0.5);
    expect(tickRate(5)).toBe(1);
    expect(tickRate(25)).toBe(3);
    expect([0, 5, 10, 15, 20, 25].every(isBigTick)).toBe(true);
    expect([1, 2, 3, 4, 6].some(isBigTick)).toBe(false);
  });

  it('lit up to the rate, and the knob sits on the arc', () => {
    const t = ticks(176, 1.2);
    expect(t).toHaveLength(26);
    expect(t.filter((x) => x.lit)).toHaveLength(8); // 0.5 … 1.2
    expect(t[0]!.big).toBe(true);
    const k = knobPoint(176, 0.5);
    expect(Math.hypot(k.x - 88, k.y - 88)).toBeCloseTo(88 - 18 - 16, 5);
    expect(k.x).toBeLessThan(88); // bottom left
    expect(k.y).toBeGreaterThan(88);
  });

  it('a touch becomes a place on the arc; the gap at the bottom snaps to the nearer end', () => {
    const s = 176;
    expect(dialFraction(88 - 60, 88 + 60, s)).toBeCloseTo(0.0, 1); // bottom left = start
    expect(dialFraction(88, 88 - 60, s)).toBeCloseTo(0.5, 2); // top = half way
    expect(dialFraction(88 + 60, 88 + 60, s)).toBeCloseTo(1, 1); // bottom right = end
    expect(dialFraction(88 - 5, 88 + 80, s)).toBe(0); // in the gap, left half
    expect(dialFraction(88 + 5, 88 + 80, s)).toBe(1); // in the gap, right half
  });

  it('the clock: six minutes from 12 o\'clock, clockwise; the track fills as the time runs out', () => {
    expect(CLOCK_MINUTES).toEqual([5, 10, 15, 30, 45, 60]);
    const top = clockPoint(0, 6, 270, 52);
    expect(top.x).toBeCloseTo(135, 5);
    expect(top.y).toBeLessThan(40);
    const third = clockPoint(3, 6, 270, 52); // 30 is at 6 o'clock
    expect(third.x).toBeCloseTo(135, 5);
    expect(third.y).toBeGreaterThan(230);
    expect(elapsedShare(30, 30 * 60_000)).toBe(0);
    expect(elapsedShare(30, 15 * 60_000)).toBeCloseTo(0.5, 5);
    expect(elapsedShare(30, 0)).toBe(1);
    expect(elapsedShare(0, 5)).toBe(0);
  });

  it('the moon says what is armed', () => {
    expect(moonLabel({ endOfEpisode: false }, undefined)).toBe('Sleep');
    expect(moonLabel({ endOfEpisode: true }, undefined)).toBe('End');
    expect(moonLabel({ endOfEpisode: false, deadline: 1 }, 24 * 60_000 + 12_000)).toBe('24:12');
    expect(moonA11y({ endOfEpisode: false }, undefined)).toBe('Sleep timer, off');
    expect(moonA11y({ endOfEpisode: false, deadline: 1 }, 65_000)).toBe('Sleep timer, pausing in 1:05');
    expect(moonA11y({ endOfEpisode: true }, undefined)).toBe('Sleep timer, stops at the end of this episode');
  });
});

describe('small rules of the page', () => {
  it('the status line: one line at most, the loudest state first', () => {
    const none = { kind: 'playing', by: undefined };
    expect(statusLine({ kind: 'error', by: undefined, message: 'Nope' }, undefined, false, undefined)).toBe('Nope');
    expect(statusLine({ kind: 'ended', by: undefined }, undefined, true, '5 listening now')).toBe('Finished');
    expect(statusLine({ kind: 'buffering', by: undefined }, undefined, false, undefined)).toBe('Buffering…');
    expect(statusLine({ kind: 'loading', by: undefined }, undefined, false, undefined)).toBe('Loading…');
    expect(statusLine({ kind: 'paused', by: 'output-lost' }, undefined, false, undefined)).toBe('Paused — your headphones disconnected');
    expect(statusLine({ kind: 'paused', by: 'user' }, undefined, false, undefined)).toBeUndefined();
    expect(statusLine(none, { startMs: 722_000, endMs: 752_000 }, true, 'x')).toBe('Playing a clip · 12:02–12:32 · pauses at the end');
    expect(statusLine(none, undefined, true, 'x')).toBe("Couldn't refresh comments — showing the last copy");
    expect(statusLine(none, undefined, false, '12 listening now')).toBe('12 listening now');
    expect(statusLine(none, undefined, false, undefined)).toBeUndefined();
  });

  it('a pin keeps one colour per person, from the palette', () => {
    const palette = [colour.pinGreen, colour.pinBlue, colour.violet, colour.hot];
    expect(pinColour('Rui')).toBe(pinColour('Rui'));
    expect(palette).toContain(pinColour('Rui'));
    expect(palette).toContain(pinColour(undefined));
    expect(palette).toContain(pinColour(null));
    expect(new Set(['Rui', 'Ana', 'Jo', 'Mia', 'Lee', 'Sam'].map(pinColour)).size).toBeGreaterThan(1);
  });

  it('the ring is 330 where it fits and shrinks with the window; never under 96', () => {
    expect(ringSize({ width: 390, height: 844 })).toBe(PLAYER.ring);
    // Round 2: the ring shrinks only to keep clear of the title block (the room = height - 226 - 96 - 118 - 8).
    expect(ringSize({ width: 390, height: 700 })).toBe(700 - 226 - 96 - 118 - 8);
    expect(ringSize({ width: 320, height: 568 })).toBe(120); // F13: the floor is 96, not 200
    expect(ringSize({ width: 300, height: 900 })).toBe(240);
    expect(ringSize({ width: 200, height: 300 })).toBe(96);
    expect(ringSize({ width: 1024, height: 1366 })).toBe(330);
  });

  it('the glow is the show\'s colour when it is a plain hex, else the drawing\'s pink (or the listener\'s other accent); the drawing\'s indigo is the other end', () => {
    expect(glowPair('#336699', colour.hot)).toEqual(['#336699', '#5b3df5']);
    expect(glowPair(' #336699 ', colour.hot)[0]).toBe('#336699');
    expect(glowPair('rebeccapurple', colour.hot)[0]).toBe('#ff6b8b');
    expect(glowPair(null, colour.hot)[0]).toBe('#ff6b8b');
    expect(glowPair(undefined, '#123456')[0]).toBe('#123456');
  });

  it('a drag along the deck moves a card one place per card, kept inside the queue', () => {
    expect(dragTarget(2, 0, 5)).toBe(2);
    expect(dragTarget(2, CARD_PITCH, 5)).toBe(3);
    expect(dragTarget(2, -CARD_PITCH * 2, 5)).toBe(0);
    expect(dragTarget(2, CARD_PITCH * 9, 5)).toBe(4);
    expect(dragTarget(2, -CARD_PITCH * 9, 5)).toBe(0);
    expect(dragTarget(0, 95, 3, 190)).toBe(1); // half a pitch rounds up
  });

  it('a chapter\'s progress: through its own length, to the next chapter, or to the end', () => {
    const ch = [{ startMs: 0 }, { startMs: 100_000 }, { startMs: 200_000, endMs: 300_000 }];
    expect(chapterProgress(ch, 0, 50_000)).toBe(0.5);
    expect(chapterProgress(ch, 1, 50_000)).toBe(0); // not reached yet
    expect(chapterProgress(ch, 2, 250_000)).toBe(0.5);
    expect(chapterProgress(ch, 1, 150_000, 400_000)).toBe(0.5);
    expect(chapterProgress([{ startMs: 0 }], 0, 5_000)).toBe(0); // no end and no length
  });
});
