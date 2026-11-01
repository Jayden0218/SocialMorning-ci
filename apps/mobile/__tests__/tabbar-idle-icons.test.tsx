// Tests that every tab that is not selected draws its outline icon in the idle colour, on every tab.
/**
 * 035 T050 (device check L1; FR-008). On Chat and Me the Discover tab drew a solid black disc on the near-black bar (1.04:1,
 * measured from pixels in r03-01, r06-04, r12-01, r13-01, r18-02…04) while on Updates it drew the grey outline (r15-01). The
 * rule: an unselected tab is the OUTLINE glyph, stroked in `idle`, and the filled glyph (the compass is a solid disc with a
 * void needle) is only ever the selected tab's, in `text`. Checked on the drawn svg, not just the props: that is what is painted.
 * Breaks that turn it red: draw the filled compass for an unselected tab; stroke it black; let a stale selected state keep it.
 */
jest.useFakeTimers();
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { TabBar, type TabItem } from '@/ui/shell/TabBar';
import { colour } from '@/design';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.mock('@/ui/kit/haptics', () => ({ tick: () => undefined }));
const ITEMS: TabItem[] = [
  { key: 'index', label: 'Discover', icon: { idle: 'compass-outline', active: 'compass' } },
  { key: 'library', label: 'Updates', icon: { idle: 'headset-outline', active: 'headset' } },
  { key: 'chat', label: 'Chat', icon: { idle: 'chatbubbles-outline', active: 'chatbubbles' } },
  { key: 'me', label: 'Me', icon: { idle: 'person-circle-outline', active: 'person-circle' } },
];
let r: ReactTestRenderer;
beforeEach(() => setReducedMotionForTest(true));
afterEach(() => { act(() => r?.unmount()); setReducedMotionForTest(undefined); });
const mount = (activeKey: string) => act(() => { r = create(createElement(TabBar, { items: ITEMS, activeKey, onSelect: jest.fn() })); });
/** The svg xml painted for a drawn icon, by its testID. */
const xmlOf = (name: string): string | undefined => r.root.findAll((n) => n.props['testID'] === `icon-${name}`)[0]?.props['xml'] as string | undefined;

describe.each(['library', 'chat', 'me'])('with %s selected', (active) => {
  it('Discover is the outline compass, stroked in idle, with no solid fill', () => {
    mount(active);
    const xml = xmlOf('compass-outline');
    expect(xml).toBeDefined();
    expect(xml).toContain(`stroke="${colour.idle}"`);
    expect(xml).not.toContain(`fill="${colour.idle}"`);
    expect(xmlOf('compass')).toBeUndefined();            // the filled compass is not drawn at all
    expect(xml).not.toMatch(/#0{3,6}|black/i);
  });
});

it('with Discover selected it is the filled compass in text colour, and nothing else is filled', () => {
  mount('index');
  expect(xmlOf('compass')).toContain(`fill="${colour.text}"`);
  expect(xmlOf('compass-outline')).toBeUndefined();
});

// Hypothesis for the black disc (written in gate-log.md): react-native-svg's SvgXml keeps what it parsed first, so a tab that goes from
// selected (filled compass, light) to idle was left showing a stale drawing. A drawn icon must therefore REMOUNT when its glyph or colour
// changes: its React key carries both. Break: take the key off the SvgXml in src/ui/kit/Icon.tsx.
it('a drawn icon remounts when its glyph or colour changes (its key names both)', () => {
  mount('index');
  const keyOf = (name: string): unknown => {
    const n = r.root.findAll((x) => x.props['testID'] === `icon-${name}`)[0] as unknown as { _fiber: { key: unknown } };
    return n._fiber.key;
  };
  const before = keyOf('compass');
  act(() => r.update(createElement(TabBar, { items: ITEMS, activeKey: 'chat', onSelect: jest.fn() })));
  const after = keyOf('compass-outline');
  expect(typeof before).toBe('string');
  expect(typeof after).toBe('string');
  expect(before).not.toBe(after);
});
