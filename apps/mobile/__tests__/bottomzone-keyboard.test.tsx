// Tests that the foot zone of the comments, thread and chat pages rides above the keyboard.
/**
 * 035 T046 (owner's request after T017): `/comments/[episodeId]`, `/comments/thread/[commentId]`, `/chat/[id]` and the Like page
 * all draw their foot (title row + box + Send) in `BottomZone`, which is `position: absolute` with a fixed `bottom`. Nothing moved
 * it when the keyboard opened, so the box sat under the keys (chat had its own, ineffective padding wrapper; the comments pages
 * had nothing). The zone now lifts by the keyboard's reported height (iOS), less the home strip the root layout pads.
 * Breaks that turn it red: draw `bottom: props.bottom` again; lift by a constant.
 */
import { createElement } from 'react';
import { Keyboard, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Box } from '@/ui/lib/box';
import { BottomZone } from '@/ui/comments/CommentsBottom';

type Handler = (e: { endCoordinates: { height: number } }) => void;
let handlers: Record<string, Handler[]> = {};
beforeEach(() => {
  handlers = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, fn: Handler) => {
    (handlers[name] ??= []).push(fn);
    return { remove: () => { handlers[name] = (handlers[name] ?? []).filter((h) => h !== fn); } };
  }) as never);
});
let r: ReactTestRenderer;
afterEach(() => { act(() => r?.unmount()); jest.restoreAllMocks(); });
const emit = (name: string, height = 0) => act(() => { for (const h of handlers[name] ?? []) h({ endCoordinates: { height } }); });
const mount = () => act(() => {
  r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } }, createElement(BottomZone as React.ComponentType<Record<string, unknown>>, { bottom: 6 }, createElement(Box, null))));
});
const bottom = (): number => (StyleSheet.flatten(r.root.findAll((n) => n.props['testID'] === 'comments-zone' && typeof n.type === 'string')[0]!.props['style'] as never) as { bottom: number }).bottom;

it('at rest it sits at its own bottom (6)', () => { mount(); expect(bottom()).toBe(6); });
it('with the keyboard up (336, strip 34) it sits above the keyboard\'s top (302)', () => { mount(); emit('keyboardWillShow', 336); expect(bottom()).toBeGreaterThanOrEqual(336 - 34); });
it('follows the reported height: 260 and 336 differ by 76', () => { mount(); emit('keyboardWillShow', 260); const a = bottom(); emit('keyboardWillShow', 336); expect(bottom() - a).toBe(76); });
it('returns to rest when the keyboard hides', () => { mount(); emit('keyboardWillShow', 336); emit('keyboardWillHide'); expect(bottom()).toBe(6); });
