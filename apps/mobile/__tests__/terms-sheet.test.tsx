// Tests the Terms consent sheet: open documents, Agree, Disagree and Exit.
/**
 * The consent sheet (owner, 2026-09-27): a link opens its full document in place and Back
 * returns to the sheet; Disagree opens a second page whose Exit leaves without accepting;
 * Agree (either page) accepts.
 * Each document is a card (owner, 2026-10-03): the first is open, a tap on a card's head opens
 * its points and its "Read the full …" link.
 * The break that turns the first test red: make the link's `onPress` in `src/ui/shell/Terms.tsx`
 * do nothing.
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Terms } from '@/ui/shell/Terms';
import { REFUSE_TEXT } from '@/ui/shell/consent';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance =>
  r.root.find((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
/** The app's SafeAreaProvider hands down the insets; LegalDoc reads them (useSafeAreaInsets). */
const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };
const page = (props: Parameters<typeof Terms>[0]): React.ReactElement =>
  createElement(SafeAreaInsetsContext.Provider, { value: INSETS }, createElement(Terms, props));
const text = (r: ReactTestRenderer): string => JSON.stringify(r.toJSON());
// The title bar's slide is a timer; with Reduce Motion it does not run, and every page is taken down at the end of its test.
const mounted: ReactTestRenderer[] = [];
const render = (el: React.ReactElement): ReactTestRenderer => { let r!: ReactTestRenderer; act(() => { r = create(el); }); mounted.push(r); return r; };
beforeAll(() => setReducedMotionForTest(true));
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); });
afterAll(() => setReducedMotionForTest(undefined));

it('a link opens its document, and Back returns to the sheet', () => {
  let r!: ReactTestRenderer;
  r = render(page({ onAccept: jest.fn() }));
  expect(text(r)).toContain('Service Agreement and Privacy Policy');
  act(() => { byLabel(r, 'SocialNet Privacy Policy, 4 points').props['onPress'](); });
  act(() => { byLabel(r, 'SocialNet Privacy Policy, opens the full text').props['onPress'](); });
  expect(text(r)).toContain('How we collect and use your personal information');
  expect(text(r)).not.toContain('Service Agreement and Privacy Policy');
  act(() => { byLabel(r, 'Back').props['onPress'](); });
  expect(text(r)).toContain('Service Agreement and Privacy Policy');
});

it('all three links open a different document', () => {
  const seen: string[] = [];
  for (const [name, words] of [
    ['SocialNet User Agreement', 'Scope of the Agreement'],
    ['SocialNet Privacy Policy', 'Do Not Track'],
    ['SocialNet Community Guidelines', 'Disturbing community order'],
  ] as const) {
    let r!: ReactTestRenderer;
    r = render(page({ onAccept: jest.fn() }));
    // The first card starts open; the others open with a tap on their head.
    if (name !== 'SocialNet User Agreement') act(() => { r.root.find((n) => typeof n.props['onPress'] === 'function' && String(n.props['accessibilityLabel']).startsWith(`${name}, `) && String(n.props['accessibilityLabel']).endsWith(' points')).props['onPress'](); });
    act(() => { byLabel(r, `${name}, opens the full text`).props['onPress'](); });
    expect(text(r)).toContain(words);
    seen.push(words);
  }
  expect(new Set(seen).size).toBe(3);
});

it('Disagree opens the second page; Agree and continue accepts from there', () => {
  const onAccept = jest.fn();
  let r!: ReactTestRenderer;
  r = render(page({ onAccept }));
  expect(text(r)).not.toContain(REFUSE_TEXT.slice(0, 40));
  act(() => { byLabel(r, 'Disagree').props['onPress'](); });
  expect(text(r)).toContain(REFUSE_TEXT.slice(0, 40));
  expect(onAccept).not.toHaveBeenCalled();
  act(() => { byLabel(r, 'Agree and continue').props['onPress'](); });
  expect(onAccept).toHaveBeenCalledTimes(1);
});

it('Exit app leaves without accepting; where the app cannot close, it returns to page one', () => {
  const onAccept = jest.fn();
  const exit = jest.fn((back: () => void) => back());
  let r!: ReactTestRenderer;
  r = render(page({ onAccept, exit }));
  act(() => { byLabel(r, 'Disagree').props['onPress'](); });
  act(() => { byLabel(r, 'Exit app').props['onPress'](); });
  expect(exit).toHaveBeenCalledTimes(1);
  expect(onAccept).not.toHaveBeenCalled();
  expect(text(r)).not.toContain(REFUSE_TEXT.slice(0, 40));
  expect(text(r)).toContain('Read the full agreement');
});

/**
 * M31 S-C (T061; design-pulse2 `terms--first-launch`, `terms--refused`): the Pulse layout read off the render. Break that turns the
 * first test red: put `inset={0}` back (the buttons then sit on the home bar — foot 6, title 70, not 40 and 104). The second: make a
 * card start closed in `Terms` (`useState(undefined)`), or drop the numbers. The third: give the refusal card the old bottom-sheet look.
 */
import { StyleSheet } from 'react-native';
const styleOf = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const hostById = (r: ReactTestRenderer, id: string): ReactTestInstance => r.root.findAll((n) => n.props['testID'] === id && typeof n.type === 'string')[0]!;
/** The nearest ancestor (or the node) whose style sets `bottom`: the title bar's box. */
const barBottom = (n: ReactTestInstance): number => { for (let p: ReactTestInstance | null = n; p; p = p.parent) { const b = styleOf(p)['bottom']; if (typeof b === 'number') return b; } return NaN; };

it('the title sits at 104 and the Disagree / Agree row at 40 above the edge (34 home strip + 6 / 70), like the drawing', () => {
  const r = render(page({ onAccept: jest.fn() }));
  expect(styleOf(hostById(r, 'overlay-foot'))['bottom']).toBe(40);
  expect(barBottom(hostById(r, 'title-bar-title'))).toBe(104);
  // Disagree is 120 wide and Agree fills the rest at 52.
  expect(styleOf(byLabel(r, 'Disagree').parent!.parent!)['width'] ?? styleOf(byLabel(r, 'Disagree').parent!)['width']).toBe(120);
  expect(styleOf(byLabel(r, 'Agree'))['height']).toBe(52);
  // The title is Unbounded 22 (the drawing's `font:800 22px`).
  expect(JSON.stringify(r.toJSON())).toContain('Service Agreement and Privacy Policy');
});

it('the first document is open on arrival with its points numbered 01–04; the other two are closed; the app icon is 56 round 16', () => {
  const r = render(page({ onAccept: jest.fn() }));
  const t = text(r);
  for (const n of ['01', '02', '03', '04']) expect(t).toContain(`"${n}"`);
  expect(t).toContain('Read the full agreement');
  expect(t).not.toContain('Read the full policy');
  expect(t).not.toContain('Read the full guidelines');
  const cards = r.root.findAll((n) => n.props['testID'] === 'terms-card' && typeof n.type === 'string');
  expect(cards).toHaveLength(3);
  expect(styleOf(cards[0]!)['borderRadius']).toBe(22);
  const icon = r.root.findAll((n) => typeof n.type === 'string' && styleOf(n)['width'] === 56 && styleOf(n)['height'] === 56)[0]!;
  expect(styleOf(icon)['borderRadius']).toBe(16);
});

it('after Disagree the refusal is a centred card 28 from each side with the icon, the words and two stacked full-width buttons', () => {
  const r = render(page({ onAccept: jest.fn() }));
  act(() => { byLabel(r, 'Disagree').props['onPress'](); });
  const card = hostById(r, 'terms-refusal');
  expect(styleOf(card)['marginHorizontal']).toBe(28);
  expect(styleOf(card)['borderRadius']).toBe(28);
  expect(styleOf(card)['gap']).toBe(14);
  expect(styleOf(card)['padding']).toBe(22);
  expect(byLabel(r, 'Agree and continue')).toBeTruthy();
  expect(byLabel(r, 'Exit app')).toBeTruthy();
});
