/**
 * Guard G6 — the three components M7 is allowed to **recolour but not rewrite**.
 *
 * `Scrubber`, `Rail` and `HeatCurve` each carry a row that was earned on the phone, not
 * in a suite: M3's S1 (tap a marker, seek there), M6's G11 and J5 (the bar announced as
 * "Seek, 14:32 of 34:17" with working increment/decrement; the curve as "Most reactions
 * at 29:58"; a marker as "Comment at 30:00 by Bea" — that last one replaced "1 comment
 * at 1800 seconds", found by listening to the phone).
 *
 * A restyle is exactly the kind of change that quietly drops an `accessibilityValue`.
 * This test is what makes that a red build instead of a re-run of J5 six builds later.
 *
 * The break that turns it red: delete `accessibilityValue` from `Scrubber`.
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { colour } from '../src/design';
import { Scrubber, scrubberValue } from '../src/ui/Scrubber';
import { Rail, markerLabel } from '../src/ui/Rail';
import { HeatCurve, heatLabel } from '../src/ui/HeatCurve';
import type { Comment } from '../src/social/api';

const render = (el: React.ReactElement): ReactTestRenderer => {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  return r;
};
const flat = (s: unknown): Record<string, unknown> => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;
const host = (r: ReactTestRenderer, role: string) =>
  r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === role)[0];

const comment = (id: string, offsetMs: number, displayName: string): Comment =>
  ({ id, offsetMs, displayName, deleted: false, body: 'x', createdAt: 0, listenerId: 'l', replies: [] } as unknown as Comment);

it('G6: the Scrubber still announces itself, its value and its two actions', () => {
  const r = render(createElement(Scrubber, { positionMs: 872_000, durationMs: 2_057_000, onSeek: jest.fn(), onSkip: jest.fn() }));
  const bar = host(r, 'adjustable')!;
  expect(bar.props['accessibilityLabel']).toBe('Seek');
  expect(bar.props['accessibilityValue']).toEqual(scrubberValue(872_000, 2_057_000));
  expect(bar.props['accessibilityValue'].text).toBe('14:32 of 34:17');
  expect((bar.props['accessibilityActions'] as { name: string }[]).map((a) => a.name)).toEqual(['increment', 'decrement']);
});

it('the Scrubber keeps the width that made it visible AND present in the tree, and is recoloured only', () => {
  // Build 16 shipped a bar that had lost `width: '100%'`: invisible, and absent from the
  // accessibility tree entirely, because a zero-width view is not a node.
  const r = render(createElement(Scrubber, { positionMs: 0, durationMs: 1000, onSeek: jest.fn(), onSkip: jest.fn() }));
  const track = flat(host(r, 'adjustable')!.props['style']);
  expect(track['width']).toBe('100%');
  expect(track['height']).toBe(8);
  expect(track['backgroundColor']).toBe(colour.track);
});

it('G6: a Rail marker still says the moment the way people read it, and who wrote it', () => {
  expect(markerLabel({ second: 1800, offsetMs: 1_800_000, comments: [comment('c1', 1_800_000, 'Bea')] }))
    .toBe('Comment at 30:00 by Bea');
  const r = render(createElement(Rail, {
    comments: [comment('c1', 1_800_000, 'Bea')],
    durationMs: 3_600_000,
    onTap: jest.fn(),
  }));
  const marker = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === 'Comment at 30:00 by Bea')[0];
  expect(marker).toBeDefined();
  expect(marker!.props['accessibilityRole']).toBe('button');
});

it('G6: the HeatCurve still says where the reactions are, and the bars clear the 3:1 floor', () => {
  const buckets = new Array<number>(100).fill(0);
  buckets[87] = 1;
  const label = heatLabel({ available: true, buckets }, 2_057_000);
  expect(label).toMatch(/Most reactions at/);
  const r = render(createElement(HeatCurve, {
    heat: { available: true, buckets }, durationMs: 2_057_000, myBuckets: [87], onSeek: jest.fn(),
  }));
  const curve = host(r, 'adjustable')!;
  expect(curve.props['accessibilityLabel']).toBe(label);
  // The bars carry information, so they are the 40 % token, not the reference's 30 %.
  const bars = r.root.findAll((n) => typeof n.type === 'string' && flat(n.props['style'])['backgroundColor'] === colour.bar);
  expect(bars.length).toBeGreaterThan(90);
  // The listener's own bucket is the accent — apart from the grey by hue AND by a label.
  const mine = r.root.findAll((n) => typeof n.type === 'string' && flat(n.props['style'])['backgroundColor'] === colour.accent);
  expect(mine).toHaveLength(1);
});
