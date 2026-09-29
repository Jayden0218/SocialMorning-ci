/**
 * M12 guard G-N2 (FR-093): a switch per show; a flip is sent, and a refused one flips back.
 * The break: drop the `set(!enabled)` in NotifyShows' catch.
 */
jest.mock('../src/ui/providers', () => ({ useStores: () => ({ settings: { get: () => 'light' } }) }));
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { NotifyShows } from '../src/ui/settings/NotifyShows';

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const switchFor = (r: ReactTestRenderer, label: string) => r.root.find((n) => n.props['accessibilityLabel'] === label && typeof n.props['onValueChange'] === 'function');

it('lists each show, sends a flip, and flips back when the server refuses', async () => {
  const save = jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('no'));
  const load = () => Promise.resolve([{ feedUrl: 'https://a/x.xml', title: 'Show A', enabled: true }, { feedUrl: 'https://b/y.xml', title: '', enabled: true }]);
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(NotifyShows, { load, save, titleOf: () => 'Cached B' })); });
  await flush();
  expect(switchFor(r, 'Show A').props['value']).toBe(true);
  expect(switchFor(r, 'Cached B').props['value']).toBe(true);

  await act(async () => { switchFor(r, 'Show A').props['onValueChange'](false); });
  await flush();
  expect(save).toHaveBeenCalledWith('https://a/x.xml', false);
  expect(switchFor(r, 'Show A').props['value']).toBe(false);

  await act(async () => { switchFor(r, 'Cached B').props['onValueChange'](false); });
  await flush();
  expect(switchFor(r, 'Cached B').props['value']).toBe(true);
  expect(JSON.stringify(r.toJSON())).toContain("didn't save");
});
