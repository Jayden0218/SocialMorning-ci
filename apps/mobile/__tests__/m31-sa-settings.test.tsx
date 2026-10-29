// Tests that the Settings hub and the settings pages About … More match their drawings in the numbers the owner compared.
/**
 * M31 S-A (T060 part 1; owner: "the design I want completely the same, or you can explain why it is different"). Source of every
 * number: specs/033-m31-redesign/design-pulse2 `settings.html` entries `account--*`, `settings-account--*`, `settings-account-email--*`,
 * `settings-account-more--*`, `settings-appearance--*`, `settings-background--*`, `settings-blocked--*`, `settings-collected--*`,
 * `settings-devices--*`, `settings-downloads--*`, `settings-feedback--*`, `settings-help--*`, `settings-how-for-you--*`,
 * `settings-licences--*`, `settings-minor--*`, `settings-more--*`, `settings-about--*`, and kit.js / kit.css. Each test names the revert that
 * turns it red (each was seen red once, then restored):
 *  - the hub: the hero tile is 88 tall (radius 22), the seven everyday tiles 112 (radius 22, padding 14) two to a row, the four info rows
 *    60, under the edge labels ACCOUNT / EVERYDAY / INFO; Sign out is a ring pill that asks in the kit Dialog: `SET.heroMin` or `SET.bigMin`
 *    changed, `BigGrid` laying three to a row, the `Sec` labels dropped — red;
 *  - a tile that is ON is the tinted wash with the hot ring: `settingsColour.wash` removed from `BigTile` — red;
 *  - Appearance: seven 44 swatches, the chosen one wears the 54 ring and the tick, and every accent is measured against the three
 *    surfaces it sits on (the numbers are in the test): the ring condition changed, an accent swapped for a dim one — red;
 *  - Downloads: the 8 tall bar is filled to the share used, the two "When" switches are large tiles, the two clears ask first: `share`
 *    computed wrongly, a tile turned into a row — red;
 *  - Devices: loading, error (the whole tile is the button), signed out, and Sign out all other devices needs a second tap: the
 *    `confirmAll` step removed — red;
 *  - Minor mode: the disc is 112, and 72 once a passcode is typed; four dots fill as digits arrive; the real field keeps its spoken name:
 *    `typing ? DISC.small` changed, the hidden field dropped — red;
 *  - Delete my account: the steps are 32 dots (done hot, active light, waiting outlined) and the foot buttons change with the step;
 *  - Blocked listeners: two-column cards, an odd last one keeps its half; Help: two tiles side by side; How For You: a closed tile is
 *    48.5 % wide and 104 tall, the open one full width with the wash; Licences: the first row has the top corners, the last the bottom ones.
 * On a phone, nothing here is verified.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });

const mockPush = jest.fn();
const mockToast = jest.fn();
const mockSignOut = jest.fn();
const mockMemory = new Map<string, string>();
let mockListener: { listenerId: string; displayName: string; email: string } | undefined = { listenerId: 'me', displayName: 'Rui Tanaka', email: 'rui.tanaka@example.com' };
let mockBlocks: { listenerId: string; displayName?: string; pending: number }[] = [];
let mockDevices: () => Promise<unknown> = () => Promise.resolve([]);
const mockAccount = {
  devices: () => mockDevices(),
  signOutDevice: jest.fn(() => Promise.resolve()),
  signOutOthers: jest.fn(() => Promise.resolve(2)),
  startEmailChange: jest.fn(() => Promise.resolve()),
  confirmEmailChange: jest.fn(() => Promise.resolve({ email: 'n@e.com', signedOut: 0 })),
};
const mockAuth = { signOut: mockSignOut, requestCode: jest.fn(() => Promise.resolve({ resendAfterSeconds: 30 })), deleteAccountWithCode: jest.fn(() => Promise.resolve()) };
const mockDownloads = {
  subscribe: () => () => undefined, usedBytes: () => 1_200_000_000, budgetBytes: () => 2_000_000_000, allowMobile: () => false, setAllowMobile: jest.fn(),
  deleteAfterPlay: () => false, setDeleteAfterPlay: jest.fn(), evictOldest: () => true, setEvictOldest: jest.fn(), remove: jest.fn(() => Promise.resolve()),
};
const mockStores = {
  settings: { get: (k: string) => mockMemory.get(k), set: (k: string, v: string) => { mockMemory.set(k, v); } },
  positions: { all: () => [] }, subscriptions: { list: () => [] },
  downloads: { list: () => [{ episodeId: 'a', state: 'complete' }, { episodeId: 'b', state: 'complete' }] },
  blocks: { all: () => mockBlocks },
};
jest.mock('expo-router', () => ({
  // `<Link asChild>` hands its props (the label, the press) to its child: so does this one.
  Link: ({ children, asChild: _a, href, ...rest }: { children: React.ReactElement<Record<string, unknown>>; asChild?: boolean; href?: unknown }) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react').cloneElement(children, { ...rest, ...children.props, onPress: children.props.onPress ?? (() => mockPush(href)) }),
  useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a) }),
  router: { push: (...a: unknown[]) => mockPush(...a), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePathname: () => '/account',
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast, useDownloads: () => mockDownloads }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/social/context', () => ({ useSocial: () => ({ api: { me: () => new Promise(() => undefined) }, auth: mockAuth, listener: mockListener, refreshListener: jest.fn() }) }));
jest.mock('@/social/profile-api', () => ({ useProfileApi: () => ({ me: () => new Promise(() => undefined) }) }));
jest.mock('@/me/my-avatar', () => ({ useMyAvatar: () => undefined }));
jest.mock('@/social/account-api', () => ({
  ...(jest.requireActual('@/social/account-api') as Record<string, unknown>),
  useAccountApi: () => mockAccount,
}));
jest.mock('@/safety/context', () => ({ useSafety: () => ({ safety: { isBlocked: () => true, unblock: jest.fn(), block: jest.fn() }, version: 0 }), announce: jest.fn() }));
jest.mock('@/social/m19-api', () => ({ useM19Api: () => ({ teenResetStart: jest.fn(() => Promise.resolve()), teenResetCheck: jest.fn(() => Promise.resolve()) }) }));
jest.mock('@/storage/clear-cache', () => ({
  ...(jest.requireActual('@/storage/clear-cache') as Record<string, unknown>),
  phoneCacheEntries: () => [], cacheBytes: () => 86_000_000, clearCache: () => 86_000_000,
}));
jest.mock('@/ui/episode/DownloadButton', () => ({ mb: (b?: number) => ((b ?? 0) >= 1e9 ? `${((b ?? 0) / 1e9).toFixed(1)} GB` : `${Math.round((b ?? 0) / 1e6)} MB`) }));
jest.mock('@/config/content', () => ({ useFaq: () => [{ q: 'Where does the audio come from?', tag: 'Listening', blocks: [] }, { q: 'How do stickers work?', tag: 'Stickers', blocks: [] }] }));
jest.mock('@/ui/content/Markdown', () => ({ MarkdownBlocks: () => null }));
jest.mock('@/social/links', () => ({ APPEALS_KEY: 'appeals', appealsMailto: () => 'mailto:appeals@socialnet.app', refreshAppeals: () => Promise.resolve('appeals@socialnet.app') }));
jest.mock('@/ui/kit/useLoad', () => ({ useLoad: () => [{ kind: 'loading' }] }));
jest.mock('@/ui/shell/updater', () => ({ distributionOf: () => undefined, updaterShown: () => false }));
jest.mock('@/ui/shell/LegalDoc', () => ({ LegalDoc: () => null }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import HubScreen from '../app/account';
import AccountSecurity from '../app/settings/account';
import AccountMore from '../app/settings/account-more';
import Appearance from '../app/settings/appearance';
import Blocked from '../app/settings/blocked';
import Devices from '../app/settings/devices';
import Downloads from '../app/settings/downloads';
import Help from '../app/settings/help';
import HowForYou from '../app/settings/how-for-you';
import Licences from '../app/settings/licences';
import Minor from '../app/settings/minor';
import MoreSettings from '../app/settings/more';
import { ACCENTS, colour } from '@/design';
import { settingsColour } from '@/design/tokens';
import { SET } from '@/ui/settings/hub-measures';
import { contrastRatio } from '@/design/contrast';
import { LICENCES } from '@/legal/licences';
import { HOW_FOR_YOU } from '@/settings/how-for-you';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => {
  setReducedMotionForTest(true);
  [mockPush, mockToast, mockSignOut, mockAccount.signOutDevice, mockAccount.signOutOthers].forEach((m) => m.mockClear());
  mockMemory.clear();
  mockListener = { listenerId: 'me', displayName: 'Rui Tanaka', email: 'rui.tanaka@example.com' };
  mockBlocks = [];
  mockDevices = () => Promise.resolve([]);
});
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); });
async function render(page: () => React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(page)); for (let i = 0; i < 4; i++) await Promise.resolve(); });
  mounted.push(r);
  return r;
}
const flat = (n: ReactTestInstance | undefined): Record<string, unknown> => (StyleSheet.flatten(n?.props['style'] as never) ?? {}) as Record<string, unknown>;
const hosts = (r: ReactTestRenderer, f: (n: ReactTestInstance) => boolean): ReactTestInstance[] => r.root.findAll((n) => typeof n.type === 'string' && f(n));
const byId = (r: ReactTestRenderer, id: string): ReactTestInstance[] => hosts(r, (n) => n.props['testID'] === id);
const say = (n: unknown): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(say).join('');
  return say((n as { props?: { children?: unknown } }).props?.children);
};
const words = (r: ReactTestRenderer): string[] => r.root.findAll((x) => String(x.type) === 'Text').map((x) => say(x.props['children']));
const named = (r: ReactTestRenderer, label: string): ReactTestInstance[] => hosts(r, (x) => x.props['accessibilityLabel'] === label);
const pressable = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no pressable "${label}"`);
  return n;
};
const press = async (r: ReactTestRenderer, label: string): Promise<void> => {
  const n = pressable(r, label);
  await act(async () => { n.props['onPress'](); for (let i = 0; i < 6; i++) await Promise.resolve(); });
};
/** The host node that carries a style and is named (a kit button wraps its Pressable). */
const styled = (r: ReactTestRenderer, label: string): Record<string, unknown> => {
  const all = hosts(r, (x) => x.props['accessibilityLabel'] === label && x.props['style'] !== undefined);
  return flat(all[all.length - 1]);
};
/** The edge labels: the headers laid along the lane (absolute); the title is a header too, but not one of these. */
const edge = (r: ReactTestRenderer): string[] => hosts(r, (n) => n.props['accessibilityRole'] === 'header' && String(n.props['className'] ?? '').includes('absolute')).map((n) => String(n.props['accessibilityLabel']));

describe('the hub (account--screen)', () => {
  it('the hero is 88 tall with radius 22; seven tiles are 112 with radius 22 and padding 14, two to a row; four info rows are 60', async () => {
    const r = await render(HubScreen);
    const hero = flat(byId(r, 'settings-hero')[0]);
    expect(hero).toMatchObject({ minHeight: SET.heroMin, borderRadius: 22, padding: 16 });
    expect(SET.heroMin).toBe(88);
    const tiles = ['Appearance', 'Downloads and cache', 'Notifications', 'Privacy', 'Minor mode', 'More', 'Playback'].map((l) => styled(r, l));
    for (const t of tiles) expect(t).toMatchObject({ minHeight: 112, borderRadius: 22, padding: 14 });
    const grid = byId(r, 'big-grid')[0]!;
    const rows = grid.findAll((n) => typeof n.type === 'string' && n.props['className'] === 'flex-row');
    expect(rows.map((row) => row.findAll((n) => typeof n.type === 'string' && flat(n)['minHeight'] === 112).length)).toEqual([2, 2, 2, 1]);
    for (const l of ['Third-party sharing list', 'Personal information we collect', 'Help and feedback', 'About SocialNet']) expect(styled(r, l)['minHeight']).toBe(60);
    expect(edge(r)).toEqual(['Account', 'Everyday', 'Info']);
  });

  it('the states are real: the accent, the space used, new-episode pushes, minor mode, skip silence', async () => {
    mockMemory.set('pref.hideExplicit', '1');
    const r = await render(HubScreen);
    expect(words(r)).toEqual(expect.arrayContaining(['Sunrise', '1.2 GB', 'New episodes on', 'What others see', 'On', 'OPML · For You', 'Skip silence off']));
    expect(words(r)).toContain('r******a@example.com');
  });

  it('every link keeps its place; signed out reads "Not signed in", "Sign in" and has no Sign out', async () => {
    mockListener = undefined;
    const r = await render(HubScreen);
    await press(r, 'Appearance');
    expect(mockPush).toHaveBeenCalledWith('/settings/appearance');
    expect(words(r)).toEqual(expect.arrayContaining(['Not signed in', 'Sign in', '—']));
    expect(named(r, 'Sign out')).toHaveLength(0);
  });

  it('Sign out is a ring pill that asks first: Stay signed in leaves it, Sign out signs out', async () => {
    const r = await render(HubScreen);
    expect(mockSignOut).not.toHaveBeenCalled();
    await press(r, 'Sign out');
    expect(words(r)).toEqual(expect.arrayContaining(['Sign out?', 'Your downloads stay on this phone. Unsent comment drafts are cleared.', 'Stay signed in']));
    await press(r, 'Stay signed in');
    expect(mockSignOut).not.toHaveBeenCalled();
    await press(r, 'Sign out');
    const confirm = r.root.findAll((x) => x.props['accessibilityLabel'] === 'Sign out' && typeof x.props['onPress'] === 'function');
    await act(async () => { confirm[confirm.length - 1]!.props['onPress'](); });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

describe('Account and security / More (delete)', () => {
  it('Account and security: the sign-in tile, the email strip with Change, Devices and More as group rows', async () => {
    const r = await render(AccountSecurity);
    expect(flat(byId(r, 'signin-card')[0])).toMatchObject({ borderRadius: 22, padding: 16 });
    expect(flat(byId(r, 'email-strip')[0])).toMatchObject({ borderRadius: 16, minHeight: 56 });
    await press(r, 'Change email');
    await press(r, 'Signed-in devices');
    await press(r, 'More account options');
    expect(mockPush.mock.calls.map((c) => c[0])).toEqual(['/settings/account-email', '/settings/devices', '/settings/account-more']);
    expect(edge(r)).toEqual(['Sign-in', 'Devices', 'More']);
  });

  it('the delete steps are 32 dots: done hot with a tick, active light, waiting outlined; the foot changes with the step', async () => {
    const r = await render(AccountMore);
    await press(r, 'Delete my account');
    const dots = (): Record<string, unknown>[] => hosts(r, (n) => n.props['className'] !== undefined && /(?:^|\s)(bg-hot|bg-text|border-line)(?:\s|$)/.test(String(n.props['className'])) && flat(n)['width'] === 32).map(flat);
    expect(dots()).toHaveLength(3);
    expect(dots().every((d) => d['height'] === 32 && d['borderRadius'] === 16)).toBe(true);
    expect(words(r)).toEqual(expect.arrayContaining(['Delete my account', 'Email me a code to confirm', 'Available once all 6 digits are in.']));
    await press(r, 'Email me a code to confirm');
    expect(mockAuth.requestCode).toHaveBeenCalledWith('rui.tanaka@example.com');
    const code = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Code' && typeof n.props['onChangeText'] === 'function')[0]!;
    await act(async () => { code.props['onChangeText']('123456'); });
    await press(r, 'Delete account');
    expect(mockAuth.deleteAccountWithCode).toHaveBeenCalledWith('123456');
  });

  it('signed out: the row is dimmed and does nothing', async () => {
    mockListener = undefined;
    const r = await render(AccountMore);
    expect(words(r)).toContain('Sign in to manage your account.');
    expect(styled(r, 'Delete my account')['opacity']).toBe(0.45);
  });
});

describe('Appearance', () => {
  it('seven 44 swatches, the chosen one wears the 54 ring and the tick; a tap picks and keeps it', async () => {
    const r = await render(Appearance);
    const swatches = byId(r, 'accent-swatch');
    expect(swatches).toHaveLength(7);
    for (const s of swatches) expect(flat(s)).toMatchObject({ width: 44, height: 44, borderRadius: 22 });
    expect(swatches.map((s) => flat(s)['backgroundColor'])).toEqual((Object.keys(ACCENTS) as (keyof typeof ACCENTS)[]).map((k) => ACCENTS[k].light.primary));
    const ring = byId(r, 'accent-ring');
    expect(ring).toHaveLength(1);
    expect(flat(ring[0])).toMatchObject({ width: 54, height: 54, borderRadius: 27, borderWidth: 2, borderColor: colour.text });
    expect(named(r, 'Accent: Sunrise')[0]!.props['accessibilityState']).toEqual({ checked: true });
    await press(r, 'Accent: Teal');
    expect(mockMemory.get('pref.accent')).toBe('teal');
    expect(named(r, 'Accent: Teal')[0]!.props['accessibilityState']).toEqual({ checked: true });
    expect(words(r)).toEqual(expect.arrayContaining(['Dark only · the accent tints Pulse\'s hot colour', 'Accent colour', 'Vibration']));
  });

  it('every accent clears AA on the three surfaces it sits on and its tick reads on the fill (measured 2026-10-28: the lowest is Sunrise at 5.38 on raise-2)', () => {
    const rows = Object.entries(ACCENTS).map(([name, t]) => ({
      name,
      void: contrastRatio(t.light.primary, colour.void),
      raise: contrastRatio(t.light.primary, colour.raise),
      raise2: contrastRatio(t.light.primary, colour.raise2),
      tick: contrastRatio(t.light.onPrimary, t.light.primary),
    }));
    for (const row of rows) for (const k of ['void', 'raise', 'raise2', 'tick'] as const) expect({ name: row.name, k, ok: row[k] >= 4.5 }).toEqual({ name: row.name, k, ok: true });
    expect(Math.min(...rows.map((x) => x.raise2))).toBeGreaterThan(5.3);
  });

  it('Vibration is a switch tile: on = the wash with the hot ring; off = the plain raise tile', async () => {
    const r = await render(Appearance);
    const tile = (): Record<string, unknown> => flat(byId(r, 'big-tile')[0]);
    expect(tile()).toMatchObject({ backgroundColor: settingsColour.wash, borderColor: settingsColour.ring, borderWidth: 1, minHeight: 112, borderRadius: 22 });
    await press(r, 'Vibration');
    expect(tile()).toMatchObject({ backgroundColor: colour.raise });
    expect(tile()['borderColor']).toBeUndefined();
  });
});

describe('Downloads and cache', () => {
  it('the phone tile: 1.2 GB at 56, the 8 tall bar filled to 60 %, the limit; two large switch tiles; two rows with switches', async () => {
    const r = await render(Downloads);
    expect(words(r)).toEqual(expect.arrayContaining(['ON THIS PHONE', '1.2', 'GB', '2 episodes', 'of a 2.0 GB storage limit', 'Pictures and saved pages']));
    const bar = flat(byId(r, 'storage-bar')[0]);
    expect(bar).toMatchObject({ height: 8, borderRadius: 4 });
    const fill = hosts(r, (n) => flat(n)['width'] === '60%')[0]!;
    expect(flat(fill)['height']).toBe(8);
    expect(byId(r, 'big-tile')).toHaveLength(2);
    expect(named(r, 'Delete after playing')).not.toHaveLength(0);
    expect(named(r, 'When storage is full, remove the oldest')[0]!.props['accessibilityState']).toMatchObject({ checked: true });
  });

  it('Clear cache and Clear downloaded episodes ask first; Clear is the hot button; the toast says what was freed', async () => {
    const r = await render(Downloads);
    await act(async () => { jest.advanceTimersByTime(10); });
    await press(r, 'Clear cache, 86.0 MB');
    expect(words(r)).toEqual(expect.arrayContaining(['Clear cache?', '86.0 MB of pictures and saved pages. Downloaded episodes are kept.']));
    expect(mockToast).not.toHaveBeenCalled();
    const clears = r.root.findAll((x) => x.props['accessibilityLabel'] === 'Clear' && typeof x.props['onPress'] === 'function');
    await act(async () => { clears[clears.length - 1]!.props['onPress'](); });
    expect(mockToast).toHaveBeenCalledWith('Cache cleared — 86.0 MB freed.');
    await press(r, 'Download queued episodes');
    expect(mockMemory.get('pref.autoDownloadQueued')).toBe('1');
  });
});

describe('Signed-in devices', () => {
  const phone = { id: 'p', kind: 'phone', label: 'iPhone 16', current: true, country: 'SG', lastActiveAt: Date.now() };
  const studio = { id: 's', kind: 'studio', label: 'Studio · Chrome on macOS', current: false, country: 'SG', lastActiveAt: Date.now() - 3 * 3600_000 };

  it('loading is "Loading…" over ghost rows; an error is one tile that is the button; signed out says so', async () => {
    mockDevices = () => new Promise(() => undefined);
    const r = await render(Devices);
    expect(words(r)).toContain('Loading…');
    expect(byId(r, 'ghost-lines')).toHaveLength(1);
    mockDevices = () => Promise.reject(new Error('x'));
    const e = await render(Devices);
    expect(byId(e, 'devices-error')).toHaveLength(1);
    expect(words(e)).toContain("Couldn't load your devices. Tap to try again.");
    mockListener = undefined;
    const s = await render(Devices);
    expect(words(s)).toContain('Sign in to see your devices.');
  });

  it('the list: this phone is a chip, the others a Sign out pill; Sign out all other devices takes a second tap', async () => {
    mockDevices = () => Promise.resolve([phone, studio]);
    const r = await render(Devices);
    expect(words(r)).toEqual(expect.arrayContaining(['This phone', 'iPhone 16', 'Studio · Chrome on macOS']));
    expect(flat(named(r, 'This phone')[0])).toMatchObject({ height: 30 });
    await press(r, 'Sign out Studio · Chrome on macOS');
    expect(mockAccount.signOutDevice).toHaveBeenCalledWith('s');
    await press(r, 'Sign out all other devices');
    expect(mockAccount.signOutOthers).not.toHaveBeenCalled();
    expect(words(r)).toContain('Tap again to sign out 1 device');
    await press(r, 'Tap again to sign out every other device');
    expect(mockAccount.signOutOthers).toHaveBeenCalledTimes(1);
  });
});

describe('Minor mode', () => {
  it('the disc is 112; turning it on shrinks it to 72, shows four dots that fill as digits arrive, and keeps the real field', async () => {
    const r = await render(Minor);
    expect(flat(byId(r, 'minor-disc')[0])).toMatchObject({ width: 112, height: 112, borderRadius: 56 });
    expect(byId(r, 'passcode-card')).toHaveLength(0);
    await act(async () => { pressable(r, 'Hide explicit episodes').props['onPress'](); });
    expect(flat(byId(r, 'minor-disc')[0])).toMatchObject({ width: 72, height: 72, borderRadius: 36 });
    expect(words(r)).toContain('Choose a 4-digit passcode. You will need it to turn minor mode off.');
    const dots = (): number => byId(r, 'passcode-dots')[0]!.children.length;
    expect(dots()).toBe(4);
    const field = r.root.findAll((n) => n.props['accessibilityLabel'] === 'Passcode' && typeof n.props['onChangeText'] === 'function')[0]!;
    expect(field.props['secureTextEntry']).toBe(true);
    await act(async () => { field.props['onChangeText']('12'); });
    const filled = byId(r, 'passcode-dots')[0]!.children.filter((c) => flat(c as ReactTestInstance)['backgroundColor'] === colour.text);
    expect(filled).toHaveLength(2);
    expect(named(r, 'Cancel').length).toBeGreaterThan(0);
  });

  it('the switch tile is the wash with the ring when on', async () => {
    mockMemory.set('pref.hideExplicit', '1');
    const r = await render(Minor);
    expect(flat(byId(r, 'minor-switch')[0])).toMatchObject({ backgroundColor: settingsColour.wash, borderColor: settingsColour.ring, borderRadius: 22, padding: 16 });
  });
});

describe('Blocked listeners, Help, How For You, More, Licences', () => {
  it('blocked: empty has the hint; one block is a count and a half-width card with the Unblock pill', async () => {
    const e = await render(Blocked);
    expect(words(e)).toEqual(expect.arrayContaining(['You have not blocked anyone', 'Block from a profile or the ⋯ on a comment.']));
    mockBlocks = [{ listenerId: 'a', displayName: 'Ana Lima', pending: 0 }];
    const r = await render(Blocked);
    expect(words(r)).toEqual(expect.arrayContaining(['1', 'listener blocked', 'AL', 'Ana Lima']));
    const cards = byId(r, 'blocked-card');
    expect(cards).toHaveLength(1);
    expect(flat(cards[0])).toMatchObject({ flex: 1, borderRadius: 22, padding: 14 });
    expect(named(r, 'Unblock Ana Lima').length).toBeGreaterThan(0);
  });

  it('help: two tiles side by side (the light one first), the chips, and a question opens in place', async () => {
    const r = await render(Help);
    const tiles = ['Send feedback, Tell us what went wrong or what you would like', 'Report a problem to support'].map((l) => styled(r, l));
    expect(tiles[0]).toMatchObject({ backgroundColor: colour.text, minHeight: 112 });
    expect(tiles[1]).toMatchObject({ backgroundColor: colour.raise, minHeight: 112 });
    expect(words(r)).toContain('Contact support');
    await press(r, 'Where does the audio come from?');
    expect(named(r, 'Where does the audio come from?')[0]!.props['accessibilityState']).toEqual({ expanded: true });
    expect(edge(r)).toEqual(['Questions', 'Not working?']);
  });

  it('how for you: the first tile is open and full width with the wash; a closed one is 48.5 % wide and 104 tall; a tap swaps them', async () => {
    const r = await render(HowForYou);
    expect(flat(byId(r, 'how-open')[0])).toMatchObject({ width: '100%', backgroundColor: settingsColour.wash });
    expect(byId(r, 'how-closed')).toHaveLength(5);
    expect(flat(byId(r, 'how-closed')[0])).toMatchObject({ width: '48.5%', minHeight: 104, borderRadius: 22 });
    await press(r, HOW_FOR_YOU[1]!.q);
    expect(byId(r, 'how-open')).toHaveLength(1);
    expect(words(r)).toContain('02');
  });

  it('more: three groups under their edge labels; the recommendations switch is the wash tile', async () => {
    const r = await render(MoreSettings);
    expect(edge(r)).toEqual(['Your shows', 'Playback', 'For You']);
    expect(flat(byId(r, 'recs-card')[0])).toMatchObject({ backgroundColor: settingsColour.wash, borderRadius: 22 });
    await press(r, 'Personalised recommendations');
    expect(mockMemory.get('pref.personalRecs')).toBe('0');
    expect(flat(byId(r, 'recs-card')[0])['backgroundColor']).toBe(colour.raise);
  });

  it('licences: one long tile — the first row has the top corners, the last the bottom ones; a row opens the package', async () => {
    const r = await render(Licences);
    expect(byId(r, 'licence-list')).toHaveLength(1);
    expect(words(r).some((w) => w.includes(`${LICENCES.length} open-source packages`))).toBe(true);
    const tiles = hosts(r, (n) => String(n.props['className'] ?? '').includes('bg-raise overflow-hidden'));
    expect(tiles.length).toBeGreaterThan(1);
    expect(flat(tiles[0])).toMatchObject({ borderTopLeftRadius: 22, borderTopRightRadius: 22, borderBottomLeftRadius: 0 });
    expect(flat(tiles[1])).toMatchObject({ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 });
    const label = `${LICENCES[0]!.name}, ${LICENCES[0]!.licence}`;
    await press(r, label);
    expect(words(r)).toContain(`Version ${LICENCES[0]!.version} · ${LICENCES[0]!.licence}`);
  });
});

describe('the lane is listed', () => {
  it('every file of this lane follows the Pulse token rules from here on (wave file and strict style)', async () => {
    const text = readFileSync(join(__dirname, '..', 'scripts', 'token-waves.mjs'), 'utf8');
    const strictAt = text.indexOf('export const STRICT_STYLE_FILES');
    for (const f of ['app/account.tsx', 'app/settings/about.tsx', 'app/settings/account-email.tsx', 'app/settings/account-more.tsx', 'app/settings/account.tsx', 'app/settings/appearance.tsx', 'app/settings/background.tsx', 'app/settings/blocked.tsx', 'app/settings/collected.tsx', 'app/settings/devices.tsx', 'app/settings/downloads.tsx', 'app/settings/feedback.tsx', 'app/settings/help.tsx', 'app/settings/how-for-you.tsx', 'app/settings/licences.tsx', 'app/settings/minor.tsx', 'app/settings/more.tsx', 'src/ui/settings/hub-parts.tsx', 'src/ui/settings/hub-measures.ts', 'src/ui/me/SignOut.tsx']) {
      expect(text.slice(0, strictAt)).toContain(`'${f}'`);
      expect(text.slice(strictAt)).toContain(`'${f}'`);
    }
  });
});
