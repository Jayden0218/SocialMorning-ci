// Tests the lock-screen comment: which comment is near, how the line is cut, and when it redraws.
/**
 * M20 US2 (spec FR-004, FR-005; research R2). Guards:
 * - G-M20-1: `commentNear` never returns a blocked, removed, deleted or host-hidden comment.
 *   Break: drop `shown(c) &&` (or `!c.hiddenByHost`) in `src/outside/now-playing.ts`.
 * - G-M20-2: LOCK_LINE redraws the lock screen only when the text changes.
 *   Break: drop the `line === (ctx.line ?? null)` early return in `src/playback/reducer.ts`.
 * Logic only — nothing here shows the line on a real lock screen (quickstart B3, NOT VERIFIED).
 */
import { createOutsideBridge, LOCK_LINE_EVERY_MS } from '@/outside/bridge';
import { commentNear, lockLineOf, NEAR_WINDOW_MS } from '@/outside/now-playing';
import { reduce } from '@/playback/reducer';
import { INITIAL_CONTEXT, INITIAL_STATE, type Effect, type PlayerContext, type PlayerEvent, type PlayerState } from '@/playback/types';
import type { Comment, Social } from '@/social/api';

const comment = (id: string, offsetMs: number | null, extra: Partial<Comment> = {}): Comment =>
  ({ id, authorId: 'a', displayName: `N${id}`, body: `body ${id}`, offsetMs, parentId: null, createdAt: '2026-10-05T00:00:00Z', deleted: false, ...extra });
const social = (comments: Comment[]): Social => ({ serverTime: '', episode: { id: 'e1', durationMs: 3_600_000 }, comments, heat: { available: false } });

describe('commentNear (G-M20-1)', () => {
  it('picks the most-liked comment within ±60 s; ties go to the nearest', () => {
    const s = social([comment('far', 200_000, { likeCount: 99 }), comment('a', 610_000, { likeCount: 2 }), comment('b', 590_000, { likeCount: 5 }), comment('c', 601_000, { likeCount: 5 })]);
    expect(commentNear(s, 600_000)?.body).toBe('body c');
    expect(commentNear(s, 600_000 + NEAR_WINDOW_MS + 11_000)).toBeUndefined();
  });

  it('never a blocked, removed, deleted, host-hidden or untimed comment', () => {
    const s = social([
      comment('blocked', 600_000, { blocked: true, likeCount: 50 }),
      comment('removed', 600_000, { removed: true, likeCount: 50 }),
      comment('deleted', 600_000, { deleted: true, body: null, likeCount: 50 }),
      comment('hidden', 600_000, { hiddenByHost: true, likeCount: 50 }),
      comment('untimed', null, { likeCount: 50 }),
      comment('ok', 630_000, { likeCount: 0 }),
    ]);
    expect(commentNear(s, 600_000)?.body).toBe('body ok');
    expect(commentNear(social(s.comments.slice(0, 5)), 600_000)).toBeUndefined();
  });

  it('the line is quoted with its author and cut at a word past 80 characters', () => {
    expect(lockLineOf({ author: 'Mei', body: 'so  true', offsetMs: 0 })).toBe('“so true” — Mei');
    const long = lockLineOf({ author: 'Mei', body: 'word '.repeat(40), offsetMs: 0 });
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith('…')).toBe(true);
    expect(long).not.toMatch(/wor…$/);
  });
});

function playingCtx(): { state: PlayerState; ctx: PlayerContext } {
  const meta = { title: 'Ep', artist: 'The Show' };
  const ev: PlayerEvent[] = [{ type: 'LOAD', episodeId: 'e1', url: 'https://x/1.mp3', startMs: 0, intent: 'play', meta }, { type: 'LOADED', loadId: 1, durationMs: 3_600_000 }];
  let state = INITIAL_STATE; let ctx = INITIAL_CONTEXT;
  for (const e of ev) ({ state, ctx } = reduce(state, e, ctx));
  return { state, ctx };
}
const lock = (effects: Effect[]) => effects.filter((e) => e.kind === 'setLockScreen');

describe('LOCK_LINE (G-M20-2)', () => {
  it('a new line redraws the lock screen with the line as the second row', () => {
    const { state, ctx } = playingCtx();
    const out = reduce(state, { type: 'LOCK_LINE', text: '“hi” — Mei' }, ctx);
    expect(lock(out.effects)).toEqual([{ kind: 'setLockScreen', meta: { title: 'Ep', artist: '“hi” — Mei' } }]);
  });

  it('the same line again does nothing; null and empty both mean the show name', () => {
    const { state, ctx } = playingCtx();
    const one = reduce(state, { type: 'LOCK_LINE', text: 'x' }, ctx);
    expect(reduce(one.state, { type: 'LOCK_LINE', text: 'x' }, one.ctx).effects).toEqual([]);
    const back = reduce(one.state, { type: 'LOCK_LINE', text: null }, one.ctx);
    expect(lock(back.effects)[0]).toEqual({ kind: 'setLockScreen', meta: { title: 'Ep', artist: 'The Show' } });
    expect(reduce(back.state, { type: 'LOCK_LINE', text: '' }, back.ctx).effects).toEqual([]);
  });

  it('kept while the lock screen is down, used by the next play; a new episode starts with none', () => {
    const idle = reduce(INITIAL_STATE, { type: 'LOCK_LINE', text: 'x' }, INITIAL_CONTEXT);
    expect(idle.effects).toEqual([]);
    expect(idle.ctx.line).toBe('x');
    const { state, ctx } = playingCtx();
    const withLine = reduce(state, { type: 'LOCK_LINE', text: 'y' }, ctx);
    const paused = reduce(withLine.state, { type: 'PAUSE' }, withLine.ctx);
    const again = reduce(paused.state, { type: 'PLAY' }, paused.ctx);
    expect(lock(again.effects)[0]).toEqual({ kind: 'setLockScreen', meta: { title: 'Ep', artist: 'y' } });
    const next = reduce(again.state, { type: 'LOAD', episodeId: 'e2', url: 'https://x/2.mp3', startMs: 0, intent: 'play', meta: { title: 'E2', artist: 'S2' } }, again.ctx);
    expect(next.ctx.line).toBeNull();
  });
});

function fakeRuntime(first: PlayerState) {
  let state = first; const subs = new Set<() => void>();
  return { getState: () => state, subscribe: (l: () => void) => { subs.add(l); return () => subs.delete(l); }, set(s: PlayerState) { state = s; subs.forEach((l) => l()); } };
}
const at = (ms: number): PlayerState => ({ kind: 'playing', episodeId: 'e1', positionMs: ms, lastSavedMs: 0 });

describe('the bridge feeds the line (FR-004, FR-005)', () => {
  it('checks at most every 15 s, sends only changes, and honours the switch', async () => {
    let clock = 0; let on = true;
    const sent: (string | null)[] = [];
    const rt = fakeRuntime(at(595_000));
    const bridge = createOutsideBridge({
      runtime: rt, lookup: () => ({ title: 'Ep', show: 'S' }), sinks: [],
      social: async () => social([comment('ten', 600_000), comment('twenty', 1_200_000)]),
      lockLine: (t) => void sent.push(t), lockComments: () => on, now: () => clock,
    });
    await Promise.resolve(); await Promise.resolve();
    clock += 1_000; rt.set(at(596_000));
    expect(sent).toEqual(['“body ten” — Nten']);
    clock += 1_000; rt.set(at(597_000));
    expect(sent).toHaveLength(1);
    clock += LOCK_LINE_EVERY_MS; rt.set(at(1_195_000));
    expect(sent).toEqual(['“body ten” — Nten', '“body twenty” — Ntwenty']);
    clock += LOCK_LINE_EVERY_MS; rt.set(at(1_196_000));
    expect(sent).toHaveLength(2);
    on = false;
    clock += LOCK_LINE_EVERY_MS; rt.set(at(1_197_000));
    expect(sent[2]).toBeNull();
    rt.set({ kind: 'loading', episodeId: 'e1', loadId: 2, intent: 'play', positionMs: 0, url: 'u' });
    on = true; rt.set(at(600_000));
    expect(sent[3]).toBe('“body ten” — Nten');
    bridge.dispose();
  });

  it('no lockLine given → nothing is sent and nothing breaks', () => {
    const rt = fakeRuntime(at(0));
    expect(() => createOutsideBridge({ runtime: rt, lookup: () => undefined, sinks: [] }).dispose()).not.toThrow();
  });
});
