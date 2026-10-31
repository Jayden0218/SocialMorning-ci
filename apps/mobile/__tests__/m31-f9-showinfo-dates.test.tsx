// Show info dates read "12 Mar 2026", not "2026-03-12".
/**
 * M31 F9 (specs/033-m31-redesign/contact/wave-5b/README.md defect 3). Written BEFORE the fixes: red today.
 * Drawing: design-pulse2 listen.html `show-info--screen`: group rows ['clock','Claimed on','12 Mar 2026'] and ['cap','Made in the SocialNet Studio','Made on 3 Jan 2025'].
 * `shortDate` (ISO, `src/ui/kit/format.ts`) stays what it is — `format.test.ts` pins it and other pages use it; phase 2 adds a day-month-year helper for this page.
 * Not tested: the Owner row's name ("Mia Tan · …"): the app's data has no owner name (documented in app/show-info/[feedUrl].tsx).
 */
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ feedUrl: encodeURIComponent('https://feeds.example/rss') }),
  usePathname: () => '/show-info/x',
  useFocusEffect: () => undefined,
  useIsFocused: () => true,
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/ui/shell/providers', () => {
  const stores = { feeds: { getShow: () => undefined }, settings: { get: () => undefined, set: () => undefined } };
  return { useStores: () => stores, useToast: () => jest.fn(), useDownloads: () => undefined };
});
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/social/context', () => { const v = { api: {} }; return { useSocial: () => v }; });
import { ownerRows } from '../app/show-info/[feedUrl]';

describe('F9-9 Show info dates', () => {
  it('a claimed show: "Claimed on" reads 12 Mar 2026', () => {
    const rows = ownerRows({ ownerType: 'claimed', ownerCountry: 'MY', claimedAt: '2026-03-12T12:00:00Z' } as never);
    expect(rows.find((r) => r.title === 'Claimed on')?.detail).toBe('12 Mar 2026');
  });
  it('a Studio show: "Made on" reads 3 Jan 2025 (no leading zero)', () => {
    const rows = ownerRows({ ownerType: 'studio', ownerCountry: 'MY', claimedAt: '2025-01-03T12:00:00Z' } as never);
    expect(rows.find((r) => r.title === 'Made on')?.detail).toBe('3 Jan 2025');
  });
});
