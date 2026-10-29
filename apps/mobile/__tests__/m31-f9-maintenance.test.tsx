// The maintenance page's copy: the curly apostrophe, 24-hour times, "8 Oct".
/**
 * M31 F9 (specs/033-m31-redesign/contact/wave-6/README.md defect 8). Written BEFORE the fixes: red today.
 * Drawing: design-pulse2 shell.html `maintenance--screen`: the headline is "We’ll be right back" (U+2019, wave-6 measure.md: not found "We’ll be right back"), the marks
 * read "BACK 14:30", and the notes say 'Expected back at 14:30." (or "on 8 Oct, 09:00")'. A time is 24-hour with a padded hour whatever the phone's locale
 * (the jest locale, like a US phone, writes "02:30 PM"); a day is "8 Oct" (the US order "Oct 8" is the locale's).
 */
import { createElement } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

let mockUntil = new Date();
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  usePathname: () => '/maintenance',
}));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => ({ settings: { get: () => undefined } }), useToast: () => jest.fn() }));
jest.mock('@/playback/expo-audio-adapter', () => ({}));
jest.mock('@/ui/shell/startupExtras', () => ({
  ...jest.requireActual('@/ui/shell/startupExtras'),
  maintenanceInfo: () => ({ until: mockUntil.toISOString(), message: 'SocialNet is being updated.' }),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));
import MaintenanceScreen from '../app/maintenance';

const rendered: ReactTestRenderer[] = [];
afterEach(() => { for (const r of rendered.splice(0)) act(() => r.unmount()); });
const text = async (): Promise<string> => {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } }, createElement(MaintenanceScreen))); });
  rendered.push(r);
  const out: string[] = [];
  const walk = (n: unknown): void => { if (typeof n === 'string') out.push(n); else if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === 'object') walk((n as { children?: unknown }).children); };
  walk(r.toJSON());
  return out.join(' | ');
};

describe('F9-13 maintenance copy', () => {
  it('the headline uses the curly apostrophe: We’ll be right back', async () => {
    const t = await text();
    expect(t).toContain('We’ll be right back');
    expect(t).not.toContain("We'll be right back");
  });
  it('today 14:30 reads "BACK 14:30" and "Expected back at 14:30." (24 hour)', async () => {
    mockUntil = new Date(); mockUntil.setHours(14, 30, 0, 0);
    const t = await text();
    expect(t).toContain('BACK 14:30');
    expect(t).toContain('Expected back at 14:30.');
    expect(t).not.toMatch(/PM|AM/);
  });
  it('the hour is padded: 09:05 is "09:05", not "9:05 AM"', async () => {
    mockUntil = new Date(); mockUntil.setHours(9, 5, 0, 0);
    const t = await text();
    expect(t).toContain('BACK 09:05');
    expect(t).toContain('Expected back at 09:05.');
  });
  it('another day: "Expected back on 8 Oct, 09:00." (day first, 24 hour)', async () => {
    mockUntil = new Date(2030, 9, 8, 9, 0, 0, 0);
    const t = await text();
    expect(t).toContain('Expected back on 8 Oct, 09:00.');
  });
});
