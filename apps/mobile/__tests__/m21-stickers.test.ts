// Tests M21 US9 on the phone: the sticker canvas maths, earned dates, the chart's words and the recap URL.
/**
 * M21 US9 (T101–T104). The gestures themselves run only on a phone (quickstart B13, NOT VERIFIED
 * here); their maths is `src/me/sticker-layout.ts`, tested below.
 *
 * At most 10 stickers on the canvas, and every layout the canvas makes is one the server accepts.
 *   The break that turns it red: in src/me/sticker-layout.ts `addSticker`, drop the
 *   `list.length >= MAX` check — the eleventh sticker is added.
 */
import { checkPlacements, STICKER_IDS } from '@socialmorning/social-core';
import { ASPECT, MAX, SIZE, addSticker, bringToFront, box, gesture, hitTest, normaliseTurn, nudge, removeSticker, restack, sameLayout, settle, type Placement } from '@/me/sticker-layout';
import { earnedLine, stickers, STICKER_LOOK, stickerShareText } from '@/me/stickers';
import { earnedDays, theirStickers } from '@/me/my-stickers';
import { barBoxes, chartSpoken, minutesLabel, niceMax, pointLabel } from '@/me/listening-chart';
import { createListeningApi, localDay } from '@/me/listening-api';

const p = (stickerId: string, extra: Partial<Placement> = {}): Placement => ({ stickerId, x: 0.5, y: 0.5, scale: 1, rot: 0, z: 0, ...extra });

describe('sticker canvas maths (our own design)', () => {
  it('at most 10; a sticker goes up once, in the middle, on top', () => {
    let list: Placement[] = [];
    const ids = Array.from({ length: 12 }, (_, i) => `s${i}`);
    for (const id of ids) list = addSticker(list, id);
    expect(MAX).toBe(10);
    expect(list).toHaveLength(10);
    expect(addSticker(list, 's0')).toHaveLength(10);
    const one = addSticker([], 'hour-1');
    expect(one).toEqual([p('hour-1')]);
    const two = addSticker(one, 'finish-1');
    expect(two.find((x) => x.stickerId === 'finish-1')!.z).toBe(1);
    expect(addSticker(two, 'hour-1')).toEqual(two);
  });

  it('every layout the canvas makes is one the server accepts', () => {
    let list: Placement[] = [];
    for (const id of STICKER_IDS) list = addSticker(list, id);
    for (const how of ['left', 'right', 'up', 'down', 'bigger', 'smaller', 'turnLeft', 'turnRight'] as const) {
      list = list.map((x) => { let y = x; for (let i = 0; i < 60; i++) y = nudge(y, how); return y; });
      expect(checkPlacements(list)).toBe('ok');
    }
    expect(checkPlacements([settle(p('hour-1', { x: 9, y: -9, scale: 99, rot: 100, z: 42 }))])).toBe('ok');
  });

  it('turns are kept within (−π, π]', () => {
    expect(normaliseTurn(0)).toBe(0);
    expect(normaliseTurn(Math.PI)).toBeCloseTo(Math.PI);
    expect(normaliseTurn(-Math.PI)).toBeCloseTo(Math.PI);
    expect(normaliseTurn(3 * Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(normaliseTurn(-3 * Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(normaliseTurn(Number.NaN)).toBe(0);
  });

  it('sizes and places are fractions of the width, so another phone draws the same layout', () => {
    const big = box(p('hour-1', { x: 0.25, y: 0.5, scale: 2 }), 400);
    expect(big.cx).toBe(100);
    expect(big.cy).toBeCloseTo(400 * ASPECT * 0.5);
    expect(big.side).toBeCloseTo(SIZE * 400 * 2);
    const small = box(p('hour-1', { x: 0.25, y: 0.5, scale: 2 }), 200);
    expect(small.cx / 200).toBe(0.25);
    expect(small.side / 200).toBeCloseTo(SIZE * 2);
  });

  it('a touch picks the topmost sticker under it', () => {
    const list = [p('a', { z: 0 }), p('b', { z: 1 }), p('c', { x: 0.1, y: 0.1, z: 2 })];
    expect(hitTest(list, { x: 200, y: 120 }, 400)).toBe('b');
    expect(hitTest(list, { x: 40, y: 24 }, 400)).toBe('c');
    expect(hitTest(list, { x: 390, y: 230 }, 400)).toBeUndefined();
  });

  it('one finger drags; two fingers drag by their middle, pinch and turn together', () => {
    const s = p('hour-1');
    const drag = gesture(s, [{ x: 100, y: 100 }], [{ x: 140, y: 112 }], 400);
    expect(drag.x).toBeCloseTo(0.6);
    expect(drag.y).toBeCloseTo(0.5 + 12 / (400 * ASPECT));
    expect([drag.scale, drag.rot, drag.z, drag.stickerId]).toEqual([1, 0, 0, 'hour-1']);
    const from = [{ x: 100, y: 100 }, { x: 200, y: 100 }];
    const to = [{ x: 150, y: 50 }, { x: 150, y: 250 }]; // twice as far apart, turned a quarter, middle moved down 50
    const g = gesture(s, from, to, 400);
    expect(g.scale).toBeCloseTo(2);
    expect(g.rot).toBeCloseTo(Math.PI / 2);
    expect(g.x).toBeCloseTo(0.5);
    expect(g.y).toBeCloseTo(0.5 + 50 / (400 * ASPECT));
    // Never past the bounds, and nothing happens without a width or fingers.
    expect(gesture(s, from, [{ x: 150, y: 150 }, { x: 150, y: 150.1 }], 400).scale).toBe(0.5);
    expect(gesture(s, [{ x: 0, y: 0 }], [{ x: 4000, y: 4000 }], 400)).toMatchObject({ x: 1, y: 1 });
    expect(gesture(s, [{ x: 1, y: 1 }, { x: 1, y: 1 }], [{ x: 1, y: 1 }, { x: 5, y: 1 }], 400).scale).toBe(1);
    expect(gesture(s, [], [{ x: 1, y: 1 }], 400)).toBe(s);
    expect(gesture(s, [{ x: 1, y: 1 }], [{ x: 2, y: 1 }], 0)).toBe(s);
  });

  it('stacking: to the front, remove, renumbered 0…n−1', () => {
    const list = restack([p('a', { z: 5 }), p('b', { z: 2 }), p('c', { z: 9 })]);
    expect(list.map((x) => [x.stickerId, x.z])).toEqual([['b', 0], ['a', 1], ['c', 2]]);
    expect(bringToFront(list, 'b').map((x) => x.stickerId)).toEqual(['a', 'c', 'b']);
    expect(removeSticker(list, 'a').map((x) => [x.stickerId, x.z])).toEqual([['b', 0], ['c', 1]]);
    expect(sameLayout(list, [...list].reverse())).toBe(true);
    expect(sameLayout(list, removeSticker(list, 'a'))).toBe(false);
  });
});

describe('stickers: the catalogue, earned dates, others\' library', () => {
  it('every sticker in the shared catalogue has a look and a help line', () => {
    for (const id of STICKER_IDS) expect(STICKER_LOOK[id]?.how.length).toBeGreaterThan(5);
    expect(stickers({ listenedMs: 0, finished: 0, moments: 0, comments: 0 }).map((s) => s.id)).toEqual([...STICKER_IDS]);
  });

  it('"Earned 3 Oct 2026" when the day is known, otherwise "Earned"', () => {
    expect(earnedLine('2026-10-03')).toBe('Earned 3 Oct 2026');
    expect(earnedLine(undefined)).toBe('Earned');
    expect(earnedLine('soon')).toBe('Earned');
    expect(stickerShareText({ title: 'First hour' }, 'Earned 3 Oct 2026')).toBe('I earned the "First hour" sticker on SocialNet. Earned 3 Oct 2026.');
  });

  it('earned days: the server\'s hours days, and the oldest moment on this phone', () => {
    const at = new Date(2026, 8, 14, 23, 30).getTime();
    const moments = [{ id: 'm1', episodeId: 'e', atMs: 0, note: '', savedAt: at + 86_400_000 }, { id: 'm2', episodeId: 'e', atMs: 0, note: '', savedAt: at }];
    const settings = { get: (k: string) => (k === 'me.moments' ? JSON.stringify(moments) : undefined), set: () => undefined } as never;
    expect(earnedDays({ 'hour-1': '2026-09-01' }, settings)).toEqual({ 'hour-1': '2026-09-01', 'moment-1': '2026-09-14' });
    const none = { get: () => undefined, set: () => undefined } as never;
    expect(earnedDays(undefined, none)).toEqual({});
  });

  it('someone else\'s library: earned only, from their profile; none while their listening is private', () => {
    const profile = { stats: { last7: { listenedMs: 0, finished: 0, topShows: [] }, all: { listenedMs: 11 * 3_600_000, finished: 1, topShows: [] } }, recent: [{ kind: 'commented' }] } as never;
    expect(theirStickers(profile).map((s) => s.id)).toEqual(['hour-1', 'hour-10', 'finish-1', 'comment-1']);
    expect(theirStickers({ stats: null, recent: [] } as never)).toEqual([]);
  });
});

describe('listening data chart', () => {
  it('a round top for the axis', () => {
    expect(niceMax(0)).toBe(5);
    expect(niceMax(45)).toBe(60);
    expect(niceMax(1440)).toBe(1440);
    expect(niceMax(3000)).toBe(3000);
    expect(niceMax(3001)).toBe(3600);
  });

  it('labels: minutes, days and months', () => {
    expect(minutesLabel(45)).toBe('45 min');
    expect(minutesLabel(120)).toBe('2 h');
    expect(minutesLabel(125)).toBe('2 h 5 min');
    expect(pointLabel('2026-10-05')).toBe('5 Oct');
    expect(pointLabel('2026-10')).toBe('Oct 2026');
    expect(pointLabel('x')).toBe('x');
  });

  it('bars share the width with 2 pt gaps; a bar with minutes is at least 2 pt; zero is no bar', () => {
    const b = barBoxes([0, 30, 60, 0.1], 98, 100, 60);
    expect(b).toHaveLength(4);
    expect(b[0]).toEqual({ x: 0, y: 100, width: 23, height: 0 });
    expect(b[1]).toEqual({ x: 25, y: 50, width: 23, height: 50 });
    expect(b[2]!.height).toBe(100);
    expect(b[3]!.height).toBe(2);
    expect(barBoxes([], 100, 100, 5)).toEqual([]);
    expect(barBoxes([1], 0, 100, 5)).toEqual([]);
  });

  it('the chart is spoken as its total and its busiest point', () => {
    expect(chartSpoken([{ day: '2026-10-04', minutes: 10 }, { day: '2026-10-05', minutes: 45 }], 'day')).toBe('Bar chart of minutes listened per day. 55 min in all; most on 5 Oct: 45 min.');
    expect(chartSpoken([{ day: '2026-10-05', minutes: 0 }], 'day')).toBe('Bar chart of minutes listened per day. Nothing listened.');
  });
});

describe('listening API client', () => {
  it('asks with the phone\'s own date; the recap URL carries month, minutes and at most 3 shows', async () => {
    const calls: string[] = [];
    const fetch = (async (url: string) => { calls.push(url); return new Response(JSON.stringify({ range: '30d', days: [], totalMinutes: 0, topShows: [] }), { status: 200 }); }) as unknown as typeof globalThis.fetch;
    const api = createListeningApi({ baseUrl: 'https://api.test', fetch, getToken: async () => 't' });
    await api.listening('all', '2026-10-06');
    expect(calls).toEqual(['https://api.test/v1/me/listening?range=all&today=2026-10-06']);
    expect(api.recapCardUrl('2026-09', 725.4, ['A & B', 'C', 'D', 'E'])).toBe('https://api.test/v1/share/recap/2026-09.png?m=725&s=A%20%26%20B&s=C&s=D');
    expect(api.recapCardUrl('2026-09', 99_999, [])).toBe('https://api.test/v1/share/recap/2026-09.png?m=44640');
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
