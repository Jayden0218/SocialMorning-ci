// At the largest text size every Pulse text step is capped, so a fixed box cannot be outgrown; titles never break mid-word.
/**
 * M31 F10 (FR-031 "no text clipped and no control lost at the largest text size"; specs/033-m31-redesign/contact/fontscale2/README.md
 * F1-F12, contact/widths/README.md W8). Written BEFORE the fix: red on the code as it stands.
 * iOS grows every Text by the system font scale (about 2 at "200 %") unless the Text sets `maxFontSizeMultiplier`. The Pulse boxes are drawn at
 * fixed heights, so the rule is: the steps used inside fixed layouts carry a cap (display / title / hero / mono and the small steps: at most
 * 1.4), and only the long-reading steps (body, note, quote) may grow to 2. `Type` is the one place that sets it, so a screen cannot forget.
 * A caller can still pass its own `maxFontSizeMultiplier` (it wins).
 * Title bar (README F9, W8): a one-word title ("Comments", "Notifications", "Downloads") must not break in the middle of a word at font scale 2:
 * it takes one line and shrinks to fit (`adjustsFontSizeToFit`), instead of "Commen / ts".
 */
import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { typeScale, type TypeName } from '@/design';
import { Type } from '@/ui/kit/Type';
import { TitleBar } from '@/ui/kit/TitleBar';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 2 })) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, usePathname: () => '/comments/e1' }));

const mounted: ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
const render = (el: React.ReactElement): ReactTestRenderer => {
  setReducedMotionForTest(true);
  let r!: ReactTestRenderer;
  act(() => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } }, el)); });
  mounted.push(r);
  return r;
};
const textOf = (r: ReactTestRenderer): ReactTestInstance => r.root.findAll((n) => String(n.type) === 'Text')[0]!;

const STEPS = Object.keys(typeScale) as TypeName[];
/** Reading text may grow to 2; everything else sits in a box of a fixed size. */
const READING: TypeName[] = ['body', 'note', 'quote'];

describe('F10-1 Type caps every step', () => {
  it.each(STEPS)('step "%s" renders with maxFontSizeMultiplier set', (step) => {
    const r = render(createElement(Type, { step, className: 'text-text' }, 'Words'));
    const cap = textOf(r).props['maxFontSizeMultiplier'];
    expect(typeof cap).toBe('number');
    expect(cap).toBeGreaterThanOrEqual(1);
    expect(cap).toBeLessThanOrEqual(READING.includes(step) ? 2 : 1.4);
  });

  it('the display, title, hero and mono steps are capped at 1.4 or less (they sit in fixed boxes)', () => {
    for (const step of ['hero', 'title', 'heading', 'statement', 'lede', 'figure', 'mono', 'edge', 'badge', 'tag'] as TypeName[]) {
      const cap = textOf(render(createElement(Type, { step, className: 'text-text' }, 'x'))).props['maxFontSizeMultiplier'];
      expect([step, typeof cap === 'number' && cap <= 1.4]).toEqual([step, true]);
    }
  });

  it('a caller\'s own cap wins over the step\'s', () => {
    const r = render(createElement(Type, { step: 'hero', className: 'text-text', maxFontSizeMultiplier: 1.1 }, 'x'));
    expect(textOf(r).props['maxFontSizeMultiplier']).toBe(1.1);
  });
});

describe('F10-2 the title bar at font scale 2 (README F9, W8)', () => {
  const bar = (title: string, nActions = 1): ReactTestRenderer =>
    render(createElement(TitleBar, { title, bottom: 40, onBack: () => undefined, actions: [{ icon: 'ellipsis-horizontal' as const, label: 'More', onPress: () => undefined }].slice(0, nActions) }));
  const label = (r: ReactTestRenderer): ReactTestInstance => r.root.findAll((n) => n.props['accessibilityRole'] === 'header' && typeof n.props['numberOfLines'] === 'number')[0]!;

  it.each(['Comments', 'Notifications', 'Downloads'])('"%s" takes one line and shrinks to fit instead of breaking mid-word', (title) => {
    const t = label(bar(title));
    expect(t.props['numberOfLines']).toBe(1);
    expect(t.props['adjustsFontSizeToFit']).toBe(true);
  });

  it('the title bar text is capped (the drawn 30 would be 60 at scale 2)', () => {
    const cap = label(bar('Comments')).props['maxFontSizeMultiplier'];
    expect(typeof cap === 'number' && cap <= 1.4).toBe(true);
  });

  it('a title of several short words may still take lines (it breaks between words, not inside them)', () => {
    const t = label(bar('My queue', 0));
    expect(Number(t.props['numberOfLines'])).toBeGreaterThanOrEqual(2);
  });
});
