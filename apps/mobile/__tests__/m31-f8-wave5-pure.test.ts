// Wave-5 capture defects, pure parts: pushed-page toast spots, decimal storage sizes, the "11 Nov 2026" due date.
/**
 * M31 F8 (specs/033-m31-redesign/contact/wave-5/README.md, "Defects to route" 1, 2 and the date in 3).
 * Written BEFORE the fixes: every test here is red on the code as it stands.
 *
 *  1. Toasts on pushed pages whose title bar sits at the foot sit about 70 px too low (over the bar / the foot button). The drawings'
 *     numbers on a 34 pt inset, with something playing (the drawn phones carry the mini player): settings.html `tst(...)` 160 for
 *     devices, downloads, minor, not-interested, opml, privacy (also the muted-threads and often-listened toasts), queue-backups;
 *     220 for feedback (clear of the Send bar) and network; discover.html `toast--digest` 216, `toast--report` 160, `toast--tell-editors` 190.
 *     Without a now bar the toast must still clear the foot zone: title bar top (40 + 44) plus an 8 px gap = 92.
 *  2. The Downloads page's sizes are decimal as drawn: 2 000 000 000 bytes is "2.0 GB", 14 x 88 MB is "1.2 GB".
 *  3. `dueDateText` writes "11 Nov 2026", not "November 11, 2026".
 *
 * The breaks that turn each green one red again are the fixes' own reverts.
 */
jest.mock('expo-router', () => ({ usePathname: () => '/' }));
jest.mock('@/playback/store', () => ({ usePlayerSelector: () => false }));
jest.mock('@/ui/shell/providers', () => ({ useDownloads: () => ({}), useToast: () => () => undefined, useStores: () => ({}) }));
import { toastBottom } from '@/design';
import { toastPlacement } from '@/ui/shell/toastPlacement';
import { sizeLabel } from '@/storage/clear-cache';
import { mb } from '@/ui/episode/DownloadButton';
import { dueDateText } from '@/social/api-m22-server';

const at = (path: string, idle: boolean) => toastBottom(34, toastPlacement(path, idle, false));

// 037 D1: these eight pages had only their TITLE at the foot (the drawn 160 cleared it); the title is at the top now, so a toast is 8 over the highest bar (106 with the now bar, 42 without).
const TITLE_ONLY: [string, number][] = [
  ['/settings/devices', 106], ['/settings/downloads', 106], ['/settings/minor', 106], ['/settings/not-interested', 106],
  ['/settings/opml', 106], ['/settings/privacy', 106], ['/settings/queue-backups', 106], ['/report/2026-09', 106],
];
const DRAWN: [string, number][] = [
  ['/settings/feedback', 220], ['/settings/network', 220], ['/digest/2026-W43', 216], ['/search', 190],
];

describe('F8-1 toasts on pushed pages with a foot button (the title bar is at the top since 037)', () => {
  it.each(DRAWN)('%s: the toast sits at the drawn %i with something playing', (path, drawn) => {
    expect(at(path, false)).toBe(drawn);
  });
  it.each(DRAWN)('%s: with nothing playing it still clears the foot zone (title bar top 84 + 8)', (path) => {
    expect(at(path, true)).toBeGreaterThanOrEqual(92);
  });
  it.each(TITLE_ONLY)('%s: a title-only page — the toast sits at %i with something playing, 42 without', (path, spot) => {
    expect(at(path, false)).toBe(spot);
    expect(at(path, true)).toBe(42);
  });
  it('a pushed page that is not one of these is the plain rule (the Show page: 106 / 42)', () => {
    expect(at('/show/x', false)).toBe(106);
    expect(at('/show/x', true)).toBe(42);
  });
});

describe('F8-2 storage sizes are decimal, as drawn', () => {
  it('sizeLabel: a 2 000 000 000 byte limit is 2.0 GB; 14 x 88 MB is 1.2 GB; 86 MB stays MB', () => {
    expect(sizeLabel(2_000_000_000)).toBe('2.0 GB');
    expect(sizeLabel(14 * 88_000_000)).toBe('1.2 GB');
    expect(sizeLabel(86_000_000)).toBe('86.0 MB');
    expect(sizeLabel(320_000)).toBe('320 KB');
  });
  it('mb (the limit line "of a 2.0 GB storage limit"): 2 000 000 000 is 2.0 GB, 14 x 88 MB is 1.2 GB, smaller sizes stay MB', () => {
    expect(mb(2_000_000_000)).toBe('2.0 GB');
    expect(mb(14 * 88_000_000)).toBe('1.2 GB');
    expect(mb(88_000_000)).toBe('88 MB');
    expect(mb(0)).toBe('0 MB');
    expect(mb(200_000)).toBe('1 MB');
  });
});

describe('F8-3 the due date', () => {
  it('reads "11 Nov 2026"', () => {
    expect(dueDateText('2026-11-11T12:00:00.000Z')).toBe('11 Nov 2026');
    expect(dueDateText('not a date')).toBe('not a date');
  });
});
