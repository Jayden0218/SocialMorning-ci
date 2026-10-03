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
import { REFUSE_TEXT } from '@/ui/shell/terms';

const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance =>
  r.root.find((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
/** The app's SafeAreaProvider hands down the insets; LegalDoc reads them (useSafeAreaInsets). */
const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };
const page = (props: Parameters<typeof Terms>[0]): React.ReactElement =>
  createElement(SafeAreaInsetsContext.Provider, { value: INSETS }, createElement(Terms, props));
const text = (r: ReactTestRenderer): string => JSON.stringify(r.toJSON());

it('a link opens its document, and Back returns to the sheet', () => {
  let r!: ReactTestRenderer;
  act(() => { r = create(page({ onAccept: jest.fn() })); });
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
    act(() => { r = create(page({ onAccept: jest.fn() })); });
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
  act(() => { r = create(page({ onAccept })); });
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
  act(() => { r = create(page({ onAccept, exit })); });
  act(() => { byLabel(r, 'Disagree').props['onPress'](); });
  act(() => { byLabel(r, 'Exit app').props['onPress'](); });
  expect(exit).toHaveBeenCalledTimes(1);
  expect(onAccept).not.toHaveBeenCalled();
  expect(text(r)).not.toContain(REFUSE_TEXT.slice(0, 40));
  expect(text(r)).toContain('Read the full agreement');
});
