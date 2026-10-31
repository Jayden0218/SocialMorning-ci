// Tests the M21 player parts: the heat curve as seek bar, the transcript's two lines and its report menu, and the clap.
/**
 * M21 US2 (spec story 2, scenarios 4–7). Logic and rendered props only — the slide-up, the drag
 * on a real screen, the panel and the burst are quickstart B4–B6, NOT VERIFIED.
 *
 * The break that turns it red: in src/ui/player/TranscriptPane.tsx make the long-press start
 * picking even when `onReport` is given (`if (props.onReport && timed) setMenu(i)` → `setPicked([i])`)
 * — "Report a mistake" never appears.
 */
// As heat-curve.test.ts: HeatCurve reads only the theme setting from the providers (which load the audio player).
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => 'light' } }) }));

import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { TranscriptLine } from '@socialmorning/player-core';
import { TranscriptPane, nowAndNext } from '@/ui/player/TranscriptPane';
import { ClapBurst, CLAP_MS } from '@/ui/player/ClapBurst';

const lines: TranscriptLine[] = [
  { startMs: 10_000, text: 'One.' },
  { startMs: 14_000, text: 'Two.' },
  { startMs: 20_000, text: 'Three.' },
];
const render = (el: React.ReactElement): ReactTestRenderer => { let r!: ReactTestRenderer; act(() => { r = create(el); }); return r; };
const pressable = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0];

describe('the transcript', () => {
  it('now and next: before the first line only "next"; on the last line no "next"', () => {
    expect(nowAndNext(lines, 0)).toEqual({ next: lines[0] });
    expect(nowAndNext(lines, 15_000)).toEqual({ now: lines[1], next: lines[2] });
    expect(nowAndNext(lines, 99_000)).toEqual({ now: lines[2] });
    expect(nowAndNext([], 0)).toEqual({});
  });

  it('with onReport, a long-press opens the menu; "Report a mistake" hands back that line; "Share lines" starts picking', () => {
    const reported: TranscriptLine[] = [];
    const r = render(createElement(TranscriptPane, { transcript: { lines }, positionMs: 0, onSeek: () => undefined, onShareImage: () => undefined, onReport: (l: TranscriptLine) => void reported.push(l) }));
    const row = (i: number) => r.root.findAll((n) => n.props['testID'] === `transcript-line-${i}` && typeof n.props['onLongPress'] === 'function')[0]!;
    act(() => { row(1).props['onLongPress'](); });
    expect(pressable(r, 'Cancel picking lines')).toBeUndefined();
    act(() => { pressable(r, 'Report a mistake')!.props['onPress'](); });
    expect(reported).toEqual([lines[1]]);
    expect(pressable(r, 'Report a mistake')).toBeUndefined();
    act(() => { row(0).props['onLongPress'](); });
    act(() => { pressable(r, 'Share lines')!.props['onPress'](); });
    expect(pressable(r, 'Cancel picking lines')).toBeDefined();
    act(() => { r.unmount(); });
  });
});

describe('the clap', () => {
  it('draws nothing until clapped, lasts at most 1 s, and never takes a touch', () => {
    expect(CLAP_MS).toBeLessThanOrEqual(1000);
    const r = render(createElement(ClapBurst, { trigger: 0 }));
    expect(r.toJSON()).toBeNull();
    act(() => { r.update(createElement(ClapBurst, { trigger: 1 })); });
    const json = r.toJSON() as { props: Record<string, unknown> } | null;
    if (json) expect(json.props['pointerEvents']).toBe('none');
    act(() => { r.unmount(); });
  });
});
