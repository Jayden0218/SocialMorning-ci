// Tests the widget's back / forward 5 minutes: the clamp at 0 and the end of the episode.
/**
 * M20 US4 (spec FR-011; research R3). Guard G-M20-3: ±5 min clamps at 0 and finishes the
 * episode past its end. Break: in `src/playback/reducer.ts` `seekTo`, drop `Math.max(0, …)`
 * (back 5 min at 2:00 then seeks to −3:00). Logic only — the widget on a home screen and the
 * Android Auto buttons are quickstart B6, NOT VERIFIED.
 */
import { outsideSkip, setOutsideSkip } from '@/outside/bridge';
import { widgetTaskHandler } from '@/outside/android-widget';
import { reduce } from '@/playback/reducer';
import { INITIAL_CONTEXT, type PlayerContext, type PlayerState } from '@/playback/types';

const ctx: PlayerContext = { ...INITIAL_CONTEXT, meta: { title: 'Ep', artist: 'S' } };
const playing = (positionMs: number): PlayerState => ({ kind: 'playing', episodeId: 'e1', positionMs, durationMs: 3_600_000, lastSavedMs: positionMs });

describe('G-M20-3: ±5 min', () => {
  it('back 5 min at 2:00 stops at 0:00', () => {
    const out = reduce(playing(120_000), { type: 'SKIP', deltaMs: -300_000 }, ctx);
    expect(out.state).toMatchObject({ kind: 'playing', positionMs: 0 });
    expect(out.effects[0]).toEqual({ kind: 'seek', toMs: 0 });
  });

  it('forward 5 min at 20:00 goes to 25:00', () => {
    const out = reduce(playing(1_200_000), { type: 'SKIP', deltaMs: 300_000 }, ctx);
    expect(out.state).toMatchObject({ kind: 'playing', positionMs: 1_500_000 });
  });

  it('forward 5 min with 3 min left ends the episode like any end', () => {
    const out = reduce(playing(3_420_000), { type: 'SKIP', deltaMs: 300_000 }, ctx);
    expect(out.state).toEqual({ kind: 'ended', episodeId: 'e1', durationMs: 3_600_000 });
    expect(out.effects.some((e) => e.kind === 'savePosition' && e.finished)).toBe(true);
  });
});

describe('the widget buttons', () => {
  const info = { widgetName: 'NowPlaying', widgetId: 1, height: 100, width: 300, screenInfo: { screenHeightDp: 800, screenWidthDp: 400, density: 2, densityDpi: 320 } };
  it('send −5 / +5 min while the app is alive, and nothing when it is gone', async () => {
    const got: number[] = [];
    setOutsideSkip((d) => void got.push(d));
    for (const clickAction of ['SKIP_BACK_5', 'SKIP_FWD_5']) {
      await widgetTaskHandler({ widgetInfo: info, widgetAction: 'WIDGET_CLICK', clickAction, renderWidget: () => undefined } as never);
    }
    expect(got).toEqual([-300_000, 300_000]);
    setOutsideSkip(undefined);
    expect(outsideSkip(300_000)).toBe(false);
  });
});
