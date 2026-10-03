/**
 * M16a guard G-B6 (FR-002). Phone walk 2026-10-02: tapping a row in the "Up next" sheet did
 * nothing — the artwork and title were plain views; only the drag handle and ⋮ took a tap. A
 * row is now a button ("Play <title>") that plays the episode; the sheet closes on it.
 *
 * The break that turns it red: drop the `onPress` from the row's Pressable in
 * src/ui/QueueList.tsx (or the `props.onClose()` from `play` in src/ui/QueueSheet.tsx).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { QueueList } from '../src/ui/QueueList';

const stores = {
  feeds: {
    getEpisode: (id: string) => ({ id, feedUrl: 'https://f/x.xml', title: id === 'e1' ? 'Casey Wants to Believe' : 'Foot Terminal', durationMs: 2_057_000 }),
    getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Reply All' }),
  },
  positions: { get: () => undefined },
  downloads: { get: () => undefined },
} as never;

it('tapping a row plays that episode', () => {
  const onPlay = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(QueueList, { ids: ['e1', 'e2'], stores, colours: { text: 'x', muted: 'x', accent: 'x' }, onChange: jest.fn(), onPlay })); });
  const row = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Play Foot Terminal' && typeof n.props['onPress'] === 'function')[0];
  expect(row).toBeDefined();
  act(() => { row!.props['onPress'](); });
  expect(onPlay).toHaveBeenCalledWith('e2');
});

it('the sheet closes when a row plays', () => {
  const sheet = readFileSync(join(__dirname, '../src/ui/QueueSheet.tsx'), 'utf8');
  const play = sheet.slice(sheet.indexOf('const play = '), sheet.indexOf('return (', sheet.indexOf('const play = ')));
  expect(play).toContain('props.onClose()');
  expect(sheet).toMatch(/onPlay=\{play\}/);
});
