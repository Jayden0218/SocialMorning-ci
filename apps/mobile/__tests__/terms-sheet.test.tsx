/**
 * The consent sheet (owner, 2026-09-27): a link opens its full document in place and Back
 * returns to the sheet; Disagree explains and does not let anyone in; Agree does.
 * The break that turns the first test red: make the link's `onPress` in `src/ui/Terms.tsx`
 * do nothing.
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { Terms } from '../src/ui/Terms';
import { DISAGREE_NOTE } from '../src/ui/terms';

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

it('Disagree explains and does not accept; Agree accepts', () => {
  const onAccept = jest.fn();
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(Terms, { onAccept })); });
  expect(text(r)).not.toContain(DISAGREE_NOTE.slice(0, 30));
  act(() => { byLabel(r, 'Disagree').props['onPress'](); });
  expect(text(r)).toContain(DISAGREE_NOTE.slice(0, 30));
  expect(onAccept).not.toHaveBeenCalled();
  act(() => { byLabel(r, 'Agree').props['onPress'](); });
  expect(onAccept).toHaveBeenCalledTimes(1);
});
