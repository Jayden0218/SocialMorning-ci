// The save-moment panel's confirm button reads "Save moment" in hot (its spoken name stays "Save moment").
/**
 * M31 F9 (specs/033-m31-redesign/contact/wave-5b/README.md defect 4). Written BEFORE the fix: red today.
 * Drawing: design-pulse2 discover.html `library--save-moment`: `<span class="btn quiet">Cancel</span><span class="btn hot">Save moment</span>`; actions "Save moment — Right
 * button (hot)". The build's `MomentPanel` (src/ui/episode/MorePanels.tsx) prints "Save" on the light pill. The accessibilityLabel "Save moment" is the replay's action name
 * (m31-w3a-episode presses it) and stays; only the visible words and the kind change.
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockToast = jest.fn();
const mockStores = { settings: { get: () => undefined, set: () => undefined } };
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast }));
jest.mock('@/social/context', () => { const v = { api: {}, listener: undefined }; return { useSocial: () => v }; });
jest.mock('@/social/m19-api', () => ({ ...jest.requireActual('@/social/m19-api'), useM19Api: () => ({}) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, usePathname: () => '/library' }));
import { MomentPanel } from '@/ui/episode/MorePanels';

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};

describe('F9-10 Save moment button', () => {
  const mount = (): ReactTestRenderer => {
    setReducedMotionForTest(true);
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(MomentPanel, { episodeId: 'e1', atMs: 0, heat: [], durationMs: 2_880_000, onCancel: jest.fn(), onSaved: jest.fn() })); });
    mounted.push(r);
    return r;
  };
  const button = (r: ReactTestRenderer): ReactTestInstance => r.root.findAll((x) => x.props['accessibilityLabel'] === 'Save moment' && x.props['accessibilityRole'] === 'button' && typeof x.props['onPress'] === 'function')[0]!;
  it('the visible words are "Save moment"', () => {
    const r = mount();
    const words = button(r).findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
    expect(words).toContain('Save moment');
  });
  it('the pill is the hot one, not the light one', () => {
    const r = mount();
    expect(String(button(r).props['className'])).toContain('bg-hot');
    expect(String(button(r).props['className'])).not.toContain('bg-text');
  });
});
