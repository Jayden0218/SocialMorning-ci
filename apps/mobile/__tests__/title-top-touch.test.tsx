// 037 (run 41813306847, r13-me: "Favourites" found and tapped three times, the page never opened): the title block must not swallow touches over its empty areas.
/**
 * Written BEFORE the change: red today. The title bar's root, its row and its title block are boxes that span the screen's width; on a scrolled page the content
 * passes under the faded title block, and a tap on a tile there (the Me tab's Favourites, drawn at y 56 behind the title) hit the empty part of the title bar instead.
 * The bar's own controls stay pressable (a `box-none` view still lets its children take touches).
 * Break that turns it red: remove `pointerEvents="box-none"` from the bar's root or its row.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';
import { TitleBar } from '@/ui/kit/TitleBar';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, usePathname: () => '/me' }));

let r: ReactTestRenderer;
afterEach(() => { act(() => r.unmount()); setReducedMotionForTest(undefined); });
const bar = (extra: Record<string, unknown> = {}): ReactTestRenderer => {
  setReducedMotionForTest(true);
  act(() => { r = create(createElement(TitleBar, { title: 'Me', subtitle: 'My profile ›', onSubtitle: () => undefined, top: 53, onBack: () => undefined, actions: [{ icon: 'settings-outline', label: 'Settings', onPress: () => undefined }], ...extra } as never)); });
  return r;
};
const host = (id: string) => r.root.findAll((n) => n.props['testID'] === id && typeof n.type === 'string')[0]!;

describe('037 the title bar lets touches through its empty areas', () => {
  for (const shrunk of [false, true]) {
    it(`${shrunk ? 'scrolled' : 'at rest'}: the root and the row are box-none`, () => {
      bar({ shrunk });
      expect(host('title-bar').props['pointerEvents']).toBe('box-none');
      expect(host('title-bar-row').props['pointerEvents']).toBe('box-none');
    });
  }
  it('at rest the title block (the title and subtitle area) is box-none too', () => {
    bar();
    expect(host('title-bar-block').props['pointerEvents']).toBe('box-none');
  });
  it('the controls still take touches: Back, the action and the subtitle link have an onPress', () => {
    bar();
    for (const label of ['Back', 'Settings', 'My profile ›']) expect(r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function').length).toBeGreaterThan(0);
  });
});
