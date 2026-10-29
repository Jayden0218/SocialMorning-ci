// Toast spots on four more pages whose foot the F8 batch did not cover (Appeal, Gift, Profile, the Updates tab).
/**
 * M31 F9 (specs/033-m31-redesign/contact/wave-6/README.md defect 1; wave-5b defect 6). Written BEFORE the fixes: every test here is red on the code as it stands.
 * The drawings' own numbers, on a 34 pt inset with the mini player showing (the drawn phones carry it), the same rule as `m31-f8-wave5-pure.test.ts`:
 *  - design-pulse2 shell.html `toast--appeal`            toast('Appeal sent.', '', 190)             -> /appeal
 *  - design-pulse2 shell.html `toast--gift`              toast('The series is yours. Enjoy!', '', 200) -> /gift/[code] ("8 above the show's bottom zone")
 *  - design-pulse2 discover.html `toast--library`        toast('Added to the queue.', '', 300)       -> the Updates tab ("Above the title bar (300)")
 *  - design-pulse2 social.html `profile--toast`, `follow-button--toast` toast(..., '', 104) -> /profile/[id] ("8 above the bottom zone")
 * With nothing playing the toast must still clear the foot zone (title bar top 84 + 8 = 92, the F8 rule); the Updates tab is the tab bar (100) plus the
 * same 132 the drawing leaves between its title bar (168 with the now bar) and the toast (300).
 */
jest.mock('expo-router', () => ({ usePathname: () => '/' }));
jest.mock('@/playback/store', () => ({ usePlayerSelector: () => false }));
jest.mock('@/ui/shell/providers', () => ({ useDownloads: () => ({}), useToast: () => () => undefined, useStores: () => ({}) }));
import { toastBottom } from '@/design';
import { toastPlacement } from '@/ui/shell/toastPlacement';

const at = (path: string, idle: boolean) => toastBottom(34, toastPlacement(path, idle, false));

describe('F9-1 toasts on Appeal, Gift, Profile and Updates', () => {
  it.each([['/appeal', 190], ['/gift/g1', 200], ['/profile/u1', 104], ['/library', 300]] as [string, number][])('%s: the toast sits at the drawn %i with something playing', (path, drawn) => {
    expect(at(path, false)).toBe(drawn);
  });
  it.each(['/appeal', '/gift/g1', '/profile/u1'])('%s: with nothing playing it still clears the foot zone (title bar top 84 + 8)', (path) => {
    expect(at(path, true)).toBeGreaterThanOrEqual(92);
  });
  it('the Updates tab with nothing playing: 100 (tab bar) + 132 = 232, not the 108 that sits over the title bar', () => {
    expect(at('/library', true)).toBeGreaterThanOrEqual(232);
  });
  it('the other tabs keep their spots (Home 176 with both bars, 108 with the tab bar alone)', () => {
    expect(at('/', false)).toBe(176);
    expect(at('/', true)).toBe(108);
  });
});
