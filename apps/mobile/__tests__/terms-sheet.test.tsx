/**
 * The consent sheet (owner, 2026-09-27): a link opens its full document in place and Back
 * returns to the sheet; Disagree opens a second page whose Exit leaves without accepting;
 * Agree (either page) accepts.
 * The break that turns the first test red: make the link's `onPress` in `src/ui/Terms.tsx`
 * do nothing.
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Terms } from '../src/ui/Terms';
import { REFUSE_TEXT } from '../src/ui/terms';

const byLabel = (r: ReactTestRenderer, label: string): ReactTestInstance =>
  r.root.find((n) => n.props['accessibilityLabel'] === label && typeof n.props['onPress'] === 'function');
const text = (r: ReactTestRenderer): string => JSON.stringify(r.toJSON());

it('a link opens its document, and Back returns to the sheet', () => {
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(Terms, { onAccept: jest.fn() })); });
  expect(text(r)).toContain('Service Agreement and Privacy Policy');
  act(() => { byLabel(r, 'SocialNet Privacy Policy, opens the full text').props['onPress'](); });
  expect(text(r)).toContain('How we collect and use your personal information');
  expect(text(r)).not.toContain('Service Agreement and Privacy Policy');
  act(() => { byLabel(r, 'Back').props['onPress'](); });
  expect(text(r)).toContain('Service Agreement and Privacy Policy');
});

it('all three links open a different document', () => {
  const seen: string[] = [];
  for (const [label, words] of [
    ['SocialNet User Agreement, opens the full text', 'Scope of the Agreement'],
    ['SocialNet Privacy Policy, opens the full text', 'Do Not Track'],
    ['SocialNet Community Guidelines, opens the full text', 'Disturbing community order'],
  ] as const) {
    let r!: ReactTestRenderer;
    act(() => { r = create(createElement(Terms, { onAccept: jest.fn() })); });
    act(() => { byLabel(r, label).props['onPress'](); });
    expect(text(r)).toContain(words);
    seen.push(words);
  }
  expect(new Set(seen).size).toBe(3);
});

it('Disagree opens the second page; Agree and continue accepts from there', () => {
  const onAccept = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(Terms, { onAccept })); });
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
  act(() => { r = create(createElement(Terms, { onAccept, exit })); });
  act(() => { byLabel(r, 'Disagree').props['onPress'](); });
  act(() => { byLabel(r, 'Exit app').props['onPress'](); });
  expect(exit).toHaveBeenCalledTimes(1);
  expect(onAccept).not.toHaveBeenCalled();
  expect(text(r)).not.toContain(REFUSE_TEXT.slice(0, 40));
  expect(text(r)).toContain('mainly covers:');
});
