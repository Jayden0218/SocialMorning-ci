// Tests the start-up helpers: shortcut pages, maintenance parsing, release parsing and version compare.
/**
 * M22 lane 6 (T075, T077, T079): the pure halves of src/ui/shell/startupExtras.ts. The native
 * halves (the shortcuts on the icon, GitHub's answer on a phone, the maintenance page opening)
 * are Tier B — NOT VERIFIED here.
 */
import { isNewer, parseMaintenance, parseRelease, quickActionHref, QUICK_ACTIONS, whatsNewDue } from '@/ui/shell/startupExtras';
import { mayStreamNow, allowMobileThisSession, lockSkipSeconds, LOCK_SKIP_KEY } from '@/settings/playback';
import { hapticsOn, HAPTICS_KEY } from '@/ui/kit/haptics';

jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn(), setAudioModeAsync: jest.fn(async () => undefined) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: jest.fn() }) }));

const settings = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { get: (k: string) => m.get(k), set: (k: string, v: string) => void m.set(k, v) };
};

describe('app-icon shortcuts (T075)', () => {
  it('are History, Subscriptions, Playlist and Search, in that order', () => {
    expect(QUICK_ACTIONS.map((a) => a.title)).toEqual(['History', 'Subscriptions', 'Playlist', 'Search']);
    expect(QUICK_ACTIONS.map((a) => quickActionHref(a))).toEqual(['/history', '/subscriptions', '/queue', '/search']);
  });

  it('ignore anything that is not one of ours', () => {
    expect(quickActionHref(undefined)).toBeUndefined();
    expect(quickActionHref({ id: 'x', title: 'X', params: { href: '/settings/account-more' } })).toBeUndefined();
    expect(quickActionHref({ id: 'x', title: 'X', params: { href: 3 } })).toBeUndefined();
  });
});

describe('maintenance (T079)', () => {
  it('reads until + message, and nothing else', () => {
    expect(parseMaintenance({ ok: true, maintenance: { until: '2026-10-08T01:00:00.000Z', message: 'Back soon.' } })).toEqual({ until: '2026-10-08T01:00:00.000Z', message: 'Back soon.' });
    expect(parseMaintenance({ ok: true })).toBeUndefined();
    expect(parseMaintenance(null)).toBeUndefined();
    expect(parseMaintenance({ maintenance: { until: 5, message: 'x' } })).toBeUndefined();
  });
});

describe('check for updates (T077)', () => {
  it('reads a GitHub release and its APK', () => {
    const r = parseRelease({ tag_name: 'v0.2.0', body: ' Faster. ', html_url: 'https://github.com/x/releases/v0.2.0', assets: [{ name: 'notes.txt', browser_download_url: 'n' }, { name: 'app.apk', browser_download_url: 'https://dl/app.apk' }] });
    expect(r).toEqual({ version: '0.2.0', notes: 'Faster.', pageUrl: 'https://github.com/x/releases/v0.2.0', apkUrl: 'https://dl/app.apk' });
    expect(parseRelease({ tag_name: 'm22', html_url: 'u' })).toEqual({ version: 'm22', notes: '', pageUrl: 'u' });
    expect(parseRelease({ message: 'Not Found' })).toBeUndefined();
  });

  it('compares x.y.z, and never offers an unreadable tag', () => {
    expect(isNewer('0.2.0', '0.1.0')).toBe(true);
    expect(isNewer('0.1.10', '0.1.9')).toBe(true);
    expect(isNewer('1.0', '0.9.9')).toBe(true);
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('0.0.9', '0.1.0')).toBe(false);
    expect(isNewer('m22', '0.1.0')).toBe(false);
  });

  it("shows What's new once after an update, never on a first install", () => {
    expect(whatsNewDue(undefined, '0.2.0')).toBe(false);
    expect(whatsNewDue('0.2.0', '0.2.0')).toBe(false);
    expect(whatsNewDue('0.1.0', '0.2.0')).toBe(true);
  });
});

describe('settings defaults (T072, T073, T074)', () => {
  it('±5 min is off by default; on means 300 s', () => {
    expect(lockSkipSeconds(settings())).toBe(10);
    expect(lockSkipSeconds(settings({ [LOCK_SKIP_KEY]: '1' }))).toBe(300);
  });

  it('Vibration is on by default', () => {
    expect(hapticsOn(settings())).toBe(true);
    expect(hapticsOn(settings({ [HAPTICS_KEY]: '0' }))).toBe(false);
  });

  it('"Allow this time" lets mobile data through with the switch off', () => {
    const off = settings({ 'pref.mobilePlayback': '0' });
    expect(mayStreamNow(off, 'cellular')).toBe(false);
    allowMobileThisSession();
    expect(mayStreamNow(off, 'cellular')).toBe(true);
  });
});
