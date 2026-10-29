// Tests the queue deck: cards that play on a tap, a ··· menu that moves and removes, ticks in Edit mode.
/**
 * M31 T024 (design-pulse2 `player--queue-sheet`, `-edit`, `queue--item-sheet`): the same names and handlers the
 * old rows had — "Play {title}", "More for {title}", Play now / Move to top / Move up / Move down / Remove from the
 * queue, "Select {title}" — on cards. The tiles grey out at the ends of the queue. Long-press-and-slide is the
 * reorder gesture (its sum, `dragTarget`, is in m31-player-logic.test.ts); the menu is the way for a screen reader.
 * How the slide feels on a phone is NOT VERIFIED.
 *
 * The break that turns it red: in src/ui/player/QueueDeck.tsx call `move(props.ids, id, index - 1)` for Move down,
 * or leave a tile enabled at the end of the queue.
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { QueueDeck } from '@/ui/player/QueueDeck';

const stores = {
  feeds: {
    getEpisode: (id: string) => ({ id, feedUrl: 'https://f/x.xml', title: `Ep ${id}`, durationMs: 600_000 }),
    getShow: () => ({ feedUrl: 'https://f/x.xml', title: 'Reply All' }),
  },
  positions: { get: () => undefined },
  downloads: { get: (id: string) => (id === 'a' ? { state: 'complete' } : undefined) },
} as never;

const rendered: ReactTestRenderer[] = [];
const render = (props: Partial<React.ComponentProps<typeof QueueDeck>> = {}) => {
  const onChange = jest.fn();
  const onPlay = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(QueueDeck, { ids: ['a', 'b', 'c'], stores, onChange, onPlay, ...props })); });
  rendered.push(r);
  return { r, onChange, onPlay };
};
const find = (r: ReactTestRenderer, label: string): ReactTestInstance | undefined =>
  r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function')[0];
const press = (r: ReactTestRenderer, label: string) => {
  const n = find(r, label);
  if (!n) throw new Error(`no pressable "${label}"`);
  act(() => { n.props['onPress'](); });
};
afterEach(() => { for (const r of rendered.splice(0)) act(() => r.unmount()); });

it('a tap plays that card; the card is a button named "Play …" and shows its number and Downloaded', () => {
  const { r, onPlay } = render();
  press(r, 'Play Ep b');
  expect(onPlay).toHaveBeenCalledWith('b');
  const text = JSON.stringify(r.toJSON());
  expect(text).toContain('Downloaded'); // only on "a"
  expect(text.match(/Downloaded/g)).toHaveLength(1);
});

it('··· opens the menu: Move down / Move up / Move to top / Remove change the queue the way they say', () => {
  const { r, onChange } = render();
  press(r, 'More for Ep b');
  press(r, 'Move down');
  expect(onChange).toHaveBeenLastCalledWith(['a', 'c', 'b']);
  press(r, 'Move up');
  expect(onChange).toHaveBeenLastCalledWith(['b', 'a', 'c']);
  press(r, 'Move to top'); // closes the menu: it has done what it was opened for
  expect(onChange).toHaveBeenLastCalledWith(['b', 'a', 'c']);
  expect(find(r, 'Remove from the queue')).toBeUndefined();
  press(r, 'More for Ep b');
  press(r, 'Remove from the queue');
  expect(onChange).toHaveBeenLastCalledWith(['a', 'c']);
});

it('the tiles grey out at the ends: nothing moves up from the top or down from the bottom', () => {
  const { r } = render();
  press(r, 'More for Ep a');
  const state = (label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && n.props['accessibilityState'] !== undefined)[0]?.props['accessibilityState'];
  expect(state('Move up')).toEqual({ disabled: true });
  expect(state('Move to top')).toEqual({ disabled: true });
  expect(state('Move down')).toEqual({ disabled: false });
  press(r, 'Close');
  press(r, 'More for Ep c');
  expect(state('Move down')).toEqual({ disabled: true });
  expect(state('Move up')).toEqual({ disabled: false });
});

it('Play now in the menu plays and closes it', () => {
  const { r, onPlay } = render();
  press(r, 'More for Ep c');
  press(r, 'Play now');
  expect(onPlay).toHaveBeenCalledWith('c');
});

it('Edit mode: a tap ticks a card instead of playing it; a ticked card is a checked checkbox', () => {
  const onToggle = jest.fn();
  const { r, onPlay } = render({ select: { chosen: new Set(['b']), onToggle } });
  const checked = r.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'checkbox' && n.props['accessibilityState']?.checked === true);
  expect(checked).toHaveLength(1);
  press(r, 'Select Ep a');
  expect(onToggle).toHaveBeenCalledWith('a');
  expect(onPlay).not.toHaveBeenCalled();
  expect(find(r, 'Play Ep a')).toBeUndefined();
});

it('a screen reader can remove a card (an accessibility action on it)', () => {
  const { r, onChange } = render();
  const card = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Play Ep b' && Array.isArray(n.props['accessibilityActions']))[0];
  expect(card).toBeDefined();
  expect((card!.props['accessibilityActions'] as { name: string }[]).map((a) => a.name)).toContain('remove');
  act(() => { card!.props['onAccessibilityAction']({ nativeEvent: { actionName: 'remove' } }); });
  expect(onChange).toHaveBeenCalledWith(['a', 'c']);
});
