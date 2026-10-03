/**
 * M12 guard G-U2 (FR-080): an Updates row's comment icon shows the count, and says it.
 * The break: stop rendering `n` in src/ui/CommentsButton.tsx.
 */
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { CommentsButton } from '@/ui/CommentsButton';

const text = (r: ReactTestRenderer): string => JSON.stringify(r.toJSON());

it('shows the count beside the icon; none or zero shows the icon alone', () => {
  let r!: ReactTestRenderer;
  const onPress = jest.fn();
  act(() => { r = create(createElement(CommentsButton, { title: 'Ep', count: 12, colour: '#000', onPress })); });
  expect(text(r)).toContain('"12"');
  expect(r.root.findAll((n) => n.props['accessibilityLabel'] === 'Comments on Ep, 12 comments').length).toBeGreaterThan(0);
  act(() => { r = create(createElement(CommentsButton, { title: 'Ep', count: 0, colour: '#000', onPress })); });
  expect(text(r)).not.toContain('"0"');
  act(() => { r = create(createElement(CommentsButton, { title: 'Ep', count: 1500, colour: '#000', onPress })); });
  expect(text(r)).toContain('999+');
});
