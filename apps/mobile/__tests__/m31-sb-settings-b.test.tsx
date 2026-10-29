// Tests that Playback, Privacy and Notifications match their drawings, and that the player's audio rows and the settings page's stay one control.
/**
 * M31 S-B (T060 part 2; owner: "the design I want completely the same, or you can explain why it is different"). Source of every number:
 * specs/033-m31-redesign/design-pulse2 `settings.html` (`playbackPage`, `privacyPage`, `privacyMuted`, `pushPage`, `mutedInner`) and
 * kit.js / kit.css. Each test names the revert that turns it red (each was seen red once, then restored):
 *  - Playback: four large tiles two to a row in the drawn order, the state in mono, Voice boost left out where the phone cannot do it; the
 *    Playing and Sound groups; the short-sound track (raise-2, 4 / 4, choices 36); the audio rows have the sheet's look in the player and the
 *    page's group row here: `BOOST_LINE` reorder, `voiceBoostSupported` ignored, `SET.segChoice`, `look` default changed — red;
 *  - Privacy: the hero tile, the chips, the five "Others see" rows, the muted users' three states and their Unmute pill, Download my data, the
 *    Blocked row; signed out has only the hero's sign-in sentence, the chips and Blocked: the `listener ?` branch, `QuietPill` height, `SET.heroIcon` — red;
 *  - Notifications: the phone's state in a tile that opens the settings, two large tiles, six people rows, the SocialNet row, the show tiles
 *    (cover 48, switch, name), switches dimmed when signed out: `disabled={!listener}`, `SET.showCover`, the `Linking` call — red.
 */
import { createElement } from 'react';
import { Linking, Platform, StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { setReducedMotionForTest } from '@/ui/kit/useReducedMotion';

const mockToast = jest.fn();
const mockMap = new Map<string, string>();
const mockPlayer = { setSkipSilence: jest.fn(), setMusicMode: jest.fn(), setPauseOnPrompts: jest.fn(), setVoiceBoost: jest.fn(), setMixWithOthers: jest.fn() };
let mockListener: unknown = { listenerId: 'me', displayName: 'Mei Lin' };
let mockBlocks: { pending: number }[] = [];
let mockMutes: () => Promise<unknown[]> = () => Promise.resolve([]);
let mockNotifyShows: () => Promise<unknown[]> = () => Promise.resolve([]);
let mockPermission = 'granted';
const mockUnmute = jest.fn(() => Promise.resolve());
const mockExport = jest.fn(() => Promise.resolve({ expiresInHours: 24 }));
const mockSetPush = jest.fn((_p: Record<string, boolean>) => Promise.resolve());
const mockSetNotifyShow = jest.fn(() => Promise.resolve());
const mockStores = {
  settings: { get: (k: string) => mockMap.get(k), set: (k: string, v: string) => { mockMap.set(k, v); }, delete: (k: string) => { mockMap.delete(k); } },
  blocks: { all: () => mockBlocks },
  feeds: { getShow: () => undefined, getEpisode: () => undefined },
};
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  usePathname: () => '/settings/playback',
  Link: ({ children }: { children: unknown }) => children,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]); },
}));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast }));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('@/playback/store', () => ({ usePlayer: () => mockPlayer, usePlayerSelector: () => undefined, selectEpisodeId: () => undefined }));
jest.mock('@/playback/expo-audio-adapter', () => ({ setLockScreenSkipSeconds: jest.fn() }));
jest.mock('../modules/audio-route', () => ({ isAvailable: () => true, routePickerView: () => () => null, showOutputSwitcher: () => Promise.resolve(true) }));
// One object each for the whole run, as the real providers give: a new one per render re-runs the pages' effects for ever.
const mockApi = { me: () => Promise.resolve({ privateListening: false }), setPrivacy: () => Promise.resolve(), pushPrefs: () => Promise.resolve() };
const mockProfile = { me: () => Promise.resolve({}), update: () => Promise.resolve() };
const mockExtras = { mutes: () => mockMutes(), unmute: (...a: unknown[]) => (mockUnmute as (...x: unknown[]) => Promise<void>)(...a) };
const mockM22 = { mutedThreads: () => Promise.resolve([]), unmuteThread: () => Promise.resolve(), pushSwitches: () => Promise.resolve({}), setPushSwitches: (p: Record<string, boolean>) => mockSetPush(p) };
const mockDiscover = { oftenListened: () => Promise.resolve({ hidden: false }), setHideOftenListened: () => Promise.resolve() };
const mockAccount = { requestDataExport: () => mockExport() };
const mockM12 = { notifyShows: () => mockNotifyShows(), setNotifyShow: () => mockSetNotifyShow() };
const mockSocial = (): { api: typeof mockApi; listener: unknown } => ({ api: mockApi, listener: mockListener });
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial() }));
jest.mock('@/social/profile-api', () => ({ ...(jest.requireActual('@/social/profile-api') as Record<string, unknown>), useProfileApi: () => mockProfile }));
jest.mock('@/social/comment-extras-api', () => ({ useCommentExtrasApi: () => mockExtras }));
jest.mock('@/social/api-m22-social', () => ({ useM22SocialApi: () => mockM22 }));
jest.mock('@/social/api-m22-discover', () => ({ useM22DiscoverApi: () => mockDiscover }));
jest.mock('@/social/account-api', () => ({ useAccountApi: () => mockAccount }));
jest.mock('@/social/m12-api', () => ({ useM12Api: () => mockM12 }));
jest.mock('@/notify/expo', () => ({ expoNotify: { status: () => Promise.resolve(mockPermission) } }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import { colour } from '@/design';
import { settingsColour } from '@/design/tokens';
import { GluestackUIProvider } from '@/ui/lib/gluestack-ui-provider';
import { MixRow, RouteRow, VoiceBoostRow } from '@/ui/settings/AudioRows';
import PlaybackSettings from '../app/settings/playback';
import PrivacySettings from '../app/settings/privacy';
import PushSettings from '../app/settings/push';

const mounted: ReactTestRenderer[] = [];
beforeEach(() => {
  setReducedMotionForTest(true);
  mockMap.clear();
  Object.values(mockPlayer).forEach((m) => m.mockClear());
  [mockToast, mockUnmute, mockExport, mockSetPush, mockSetNotifyShow].forEach((m) => m.mockClear());
  mockListener = { listenerId: 'me', displayName: 'Mei Lin' };
  mockBlocks = [];
  mockMutes = () => Promise.resolve([]);
  mockNotifyShows = () => Promise.resolve([]);
  mockPermission = 'granted';
});
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); setReducedMotionForTest(undefined); jest.restoreAllMocks(); });
async function render(el: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(GluestackUIProvider, null, el)); for (let i = 0; i < 6; i++) await Promise.resolve(); });
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
const control = (r: ReactTestRenderer, label: string): ReactTestInstance => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && (typeof x.props['onPress'] === 'function' || typeof x.props['onChange'] === 'function'))[0];
  if (!n) throw new Error(`no control "${label}"`);
  return n;
};
/** The innermost node with this spoken name that carries a style (a kit button wraps its Pressable). */
const styled = (r: ReactTestRenderer, label: string): Record<string, unknown> => {
  const all = r.root.findAll((x) => x.props['accessibilityLabel'] === label && Object.keys(flat(x)).length > 0);
  if (all.length === 0) throw new Error(`nothing styled is named "${label}"`);
  return flat(all[all.length - 1]);
};
const press = async (r: ReactTestRenderer, label: string): Promise<void> => {
  const n = control(r, label);
  await act(async () => { n.props['onPress'](); for (let i = 0; i < 8; i++) await Promise.resolve(); });
};
const flip = async (r: ReactTestRenderer, label: string): Promise<void> => {
  const n = r.root.findAll((x) => x.props['accessibilityLabel'] === label && x.props['accessibilityRole'] === 'switch' && typeof x.props['onPress'] === 'function')[0];
  if (!n) throw new Error(`no switch "${label}"`);
  await act(async () => { n.props['onPress'](); for (let i = 0; i < 4; i++) await Promise.resolve(); });
};
const switchOf = (r: ReactTestRenderer, label: string): ReactTestInstance => r.root.findAll((x) => x.props['accessibilityLabel'] === label && x.props['accessibilityRole'] === 'switch')[0]!;

describe('Playback (settings-playback--screen)', () => {
  it('four large tiles, two to a row, in the drawn order: Skip silence, Music mode, Allow mobile data, Voice boost', async () => {
    const r = await render(createElement(PlaybackSettings));
    const grid = byId(r, 'playback-tiles')[0]!;
    const rows = grid.children.filter((c) => typeof c !== 'string') as ReactTestInstance[];
    expect(rows).toHaveLength(2);
    const order = words(r).filter((w) => ['Skip silence', 'Music mode', 'Allow mobile data for playback', 'Voice boost'].includes(w));
    expect(order.slice(0, 4)).toEqual(['Skip silence', 'Music mode', 'Allow mobile data for playback', 'Voice boost']);
    expect(hosts(r, (n) => flat(n)['minHeight'] === 112)).toHaveLength(4);
    expect(words(r)).toEqual(expect.arrayContaining(['MOST USED', 'PLAYING', 'SOUND']));
  });
  it('a tile says its state in mono and the switch saves at once', async () => {
    const r = await render(createElement(PlaybackSettings));
    expect(words(r)).toEqual(expect.arrayContaining(['Off', 'Off · voices keep pitch']));
    await flip(r, 'Skip silence');
    expect(mockPlayer.setSkipSilence).toHaveBeenCalledWith(true);
    expect(mockMap.get('pref.skipSilence')).toBe('1');
    expect(words(r)).toContain('On · sped up on iPhone');
    await flip(r, 'Music mode');
    expect(mockPlayer.setMusicMode).toHaveBeenCalledWith(true);
    expect(words(r)).toContain('On · pitch follows speed');
  });
  it('where the phone cannot do Voice boost its tile is left out and the three that remain keep their halves', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(27);
    const r = await render(createElement(PlaybackSettings));
    expect(hosts(r, (n) => flat(n)['minHeight'] === 112)).toHaveLength(3);
    expect(words(r)).not.toContain('Voice boost');
  });
  it('Playing is five rows with their lines; Playlist backups is a link', async () => {
    const r = await render(createElement(PlaybackSettings));
    for (const w of ['Queue adds to the end', 'Show transcript entry on the player', 'Comments on lock screen', 'Playlist backups', '±5 min on the lock screen', 'The last 10 versions of your playlist on this phone']) expect(words(r)).toContain(w);
    expect(r.root.findAll((n) => n.props['accessibilityRole'] === 'link' && String(n.props['accessibilityLabel']).startsWith('Playlist backups'))).not.toHaveLength(0);
    await flip(r, 'Queue adds to the end');
    expect(mockMap.get('pref.queueAddToEnd')).toBe('0');
  });
  it("Sound: the short-sound track is raise-2, 4 of padding and between, choices 36 tall radius 14; Pause saves and tells the player", async () => {
    const r = await render(createElement(PlaybackSettings));
    const track = byId(r, 'settings-segment')[0]!;
    expect(flat(track)).toMatchObject({ backgroundColor: colour.raise2, padding: 4, gap: 4, borderRadius: 18 });
    const choice = r.root.findAll((n) => n.props['accessibilityRole'] === 'tab')[0]!;
    expect(flat(choice)).toMatchObject({ height: 36, borderRadius: 14 });
    await press(r, "Another app's short sound: pause");
    expect(mockPlayer.setPauseOnPrompts).toHaveBeenCalledWith(true);
    expect(words(r)).toEqual(expect.arrayContaining(['Play with other apps', 'Lock-screen controls go away on iPhone; calls no longer pause playback']));
  });
});

describe('the audio rows: the player\'s More settings and this page are one control (AudioRows)', () => {
  it('by default a row has the sheet\'s look: a 34 icon chip, 56 tall; on the page it is a 60 group row', async () => {
    const sheet = await render(createElement(MixRow));
    expect(hosts(sheet, (n) => flat(n)['width'] === 34 && flat(n)['height'] === 34)).toHaveLength(1);
    expect(hosts(sheet, (n) => flat(n)['minHeight'] === 56)).toHaveLength(1);
    const page = await render(createElement(MixRow, { look: 'page' }));
    expect(hosts(page, (n) => flat(n)['minHeight'] === 60)).toHaveLength(1);
    expect(hosts(page, (n) => flat(n)['width'] === 34)).toHaveLength(0);
  });
  it('Voice boost in the sheet saves like the tile', async () => {
    const r = await render(createElement(VoiceBoostRow));
    await flip(r, 'Voice boost');
    expect(mockPlayer.setVoiceBoost).toHaveBeenCalledWith(true);
    expect(mockMap.get('player.voiceBoost')).toBe('1');
  });
  it('Audio output is one row with its line, in both looks', async () => {
    for (const look of ['sheet', 'page'] as const) {
      const r = await render(createElement(RouteRow, { look }));
      expect(words(r)).toEqual(expect.arrayContaining(['Audio output', 'AirPlay, Bluetooth or this phone']));
      // On an iPhone Apple's invisible picker lies over the row and is the control; it carries the spoken name.
      expect(r.root.findAll((n) => n.props['label'] === 'Audio output, AirPlay, Bluetooth or this phone')).not.toHaveLength(0);
    }
  });
});

describe('Privacy (settings-privacy--screen and its states)', () => {
  it('the hero tile: the eye 28, the title, the line, a rule, the state in mono and the switch', async () => {
    const r = await render(createElement(PrivacySettings));
    const hero = byId(r, 'privacy-hero')[0]!;
    expect(flat(hero)).toMatchObject({ borderRadius: 22, padding: 16, gap: 10 });
    expect(hero.findAll((n) => n.props['size'] === 28)).not.toHaveLength(0);
    expect(words(r)).toEqual(expect.arrayContaining(['Keep my listening private', 'Off — your listening is visible', 'Always public:', 'Comments', 'Clips']));
    await flip(r, 'Keep my listening private');
    expect(words(r)).toContain('On — your listening is private');
  });
  it('under the edge labels in the drawn order', async () => {
    const r = await render(createElement(PrivacySettings));
    const labels = words(r).filter((w) => ['LISTENING', 'OTHERS SEE', 'MUTED USERS', 'THREADS', 'MY DATA', 'BLOCKED'].includes(w));
    expect(labels.filter((_, i) => i % 2 === 0)).toEqual(['LISTENING', 'OTHERS SEE', 'MUTED USERS', 'THREADS', 'MY DATA', 'BLOCKED']);
  });
  it('Others see is one group of five rows, lines kept', async () => {
    const r = await render(createElement(PrivacySettings));
    for (const w of ['Hide my listening badge', 'Hide my sticker library', 'Hide my profile decorations', 'Keep my subscriptions private', 'Hide "Often listened"', 'The 100h+ / 500h+ / 1000h+ pill beside your comments', 'Others do not see the shows you listened to most in the last 90 days']) expect(words(r)).toContain(w);
    const switches = r.root.findAll((n) => n.props['accessibilityRole'] === 'switch' && ['Hide my listening badge', 'Hide my sticker library', 'Hide my profile decorations', 'Keep my subscriptions private', 'Hide "Often listened"'].includes(String(n.props['accessibilityLabel']))).map((n) => n.props['accessibilityLabel']);
    expect(new Set(switches).size).toBe(5);
    expect(byId(r, 'panel-group').length).toBeGreaterThanOrEqual(1);
  });
  it('Muted users: Loading… with ghosts, the error line, the empty sentence — each inside the one tile', async () => {
    mockMutes = () => new Promise(() => undefined);
    const loading = await render(createElement(PrivacySettings));
    expect(words(loading)).toContain('Loading…');
    expect(byId(loading, 'info-ghost')).toHaveLength(1);
    mockMutes = () => Promise.reject(new Error('no'));
    const failed = await render(createElement(PrivacySettings));
    expect(words(failed)).toContain("Couldn't load the listeners you muted.");
    const empty = await render(createElement(PrivacySettings));
    mockMutes = () => Promise.resolve([]);
    const none = await render(createElement(PrivacySettings));
    expect(words(none)).toContain('You have not muted anyone. Mute someone from the ⋯ on their comment; they are never told.');
    expect(flat(byId(none, 'muted-users')[0])).toMatchObject({ borderRadius: 22 });
    expect(empty).toBeDefined();
  });
  it('a muted listener: avatar 36, name, a 34 Unmute pill; Unmute removes the row and says so', async () => {
    mockMutes = () => Promise.resolve([{ id: 'm1', name: 'Mika', avatarUrl: null }]);
    const r = await render(createElement(PrivacySettings));
    expect(byId(r, 'muted-row')).toHaveLength(1);
    const pill = control(r, 'Unmute Mika');
    expect(pill).toBeDefined();
    expect(styled(r, 'Unmute Mika')).toMatchObject({ height: 34, backgroundColor: colour.raise2 });
    await press(r, 'Unmute Mika');
    expect(mockUnmute).toHaveBeenCalledWith('m1');
    expect(mockToast).toHaveBeenCalledWith('Mika is unmuted.');
    expect(byId(r, 'muted-row')).toHaveLength(0);
  });
  it('Download my data: the tile, a quiet pill that says "Asking…" and then the toast', async () => {
    const r = await render(createElement(PrivacySettings));
    expect(words(r)).toContain('Download my data');
    expect(styled(r, 'Email me a link to my data')).toMatchObject({ height: 40 });
    await press(r, 'Email me a link to my data');
    expect(mockToast).toHaveBeenCalledWith('We emailed you a link. It works for 24 hours.');
  });
  it('Blocked listeners is one row at the foot with the count in mono', async () => {
    mockBlocks = [{ pending: 0 }, { pending: 0 }, { pending: -1 }];
    const r = await render(createElement(PrivacySettings));
    const link = r.root.findAll((n) => n.props['accessibilityRole'] === 'link' && String(n.props['accessibilityLabel']).startsWith('Blocked listeners'))[0]!;
    expect(link.props['accessibilityValue']).toEqual({ text: '2' });
    expect(words(r)).toEqual(expect.arrayContaining(['Manage who you blocked', '2']));
  });
  it('signed out: the hero ends with the sign-in sentence; only the chips and Blocked follow', async () => {
    mockListener = undefined;
    const r = await render(createElement(PrivacySettings));
    expect(words(r)).toEqual(expect.arrayContaining(['Sign in to choose who sees your listening.', 'Always public:', 'BLOCKED', 'Blocked listeners']));
    expect(words(r)).not.toContain('OTHERS SEE');
    expect(words(r)).not.toContain('Download my data');
    expect(r.root.findAll((n) => n.props['accessibilityRole'] === 'switch')).toHaveLength(0);
  });
});

describe('Notifications (settings-push--screen, --signed-out)', () => {
  it("the phone's state tile opens the phone's settings", async () => {
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const r = await render(createElement(PushSettings));
    expect(words(r)).toEqual(expect.arrayContaining(['Notifications are allowed', 'Set in your phone’s settings', 'Open']));
    const tile = control(r, 'Allow notifications');
    expect(tile.props['accessibilityValue']).toEqual({ text: 'Notifications are allowed' });
    expect(flat(tile)).toMatchObject({ borderRadius: 22 });
    await press(r, 'Allow notifications');
    expect(open).toHaveBeenCalled();
  });
  it('Main: New episodes and Popular content are large tiles with their lines in mono; PEOPLE has six rows, SOCIALNET one', async () => {
    const r = await render(createElement(PushSettings));
    expect(hosts(r, (n) => flat(n)['minHeight'] === 112)).toHaveLength(2);
    expect(words(r)).toEqual(expect.arrayContaining(['MAIN', 'PEOPLE', 'SOCIALNET', 'When a show you follow publishes', "The day's pick, at most once a day", 'Replies', 'Likes', 'New followers', 'Mentions', 'Statuses', 'Weekly digest', 'System notices']));
    await flip(r, 'Likes');
    expect(mockSetPush).toHaveBeenCalledWith({ likes: false });
  });
  it('signed out: the switches are dimmed and one tile asks to sign in', async () => {
    mockListener = undefined;
    const r = await render(createElement(PushSettings));
    expect(switchOf(r, 'Replies').props['accessibilityState']).toMatchObject({ disabled: true });
    expect(words(r)).toContain('Sign in to receive notifications.');
    expect(words(r)).not.toContain('SHOWS');
  });
  it('Shows: tiles of two with a 48 cover, the switch and the name; all off while New episodes is off', async () => {
    mockNotifyShows = () => Promise.resolve([{ feedUrl: 'https://a/x.xml', title: 'Morning Notes', enabled: true }, { feedUrl: 'https://b/y.xml', title: 'Night Shift Radio', enabled: true }, { feedUrl: 'https://c/z.xml', title: 'Long Walks', enabled: false }]);
    const r = await render(createElement(PushSettings));
    expect(words(r)).toEqual(expect.arrayContaining(['SHOWS', 'New episodes, show by show', 'Morning Notes', 'Night Shift Radio', 'Long Walks']));
    expect(byId(r, 'show-tile')).toHaveLength(3);
    expect(flat(byId(r, 'show-tile')[0])).toMatchObject({ borderRadius: 22, padding: 12 });
    expect(hosts(r, (n) => flat(n)['width'] === 48 && flat(n)['height'] === 48).length).toBeGreaterThan(0);
    await flip(r, 'New episodes');
    expect(switchOf(r, 'Morning Notes').props['accessibilityState']).toMatchObject({ disabled: true, checked: false });
  });
  it('the large tile that is on wears the warm fill', async () => {
    mockMap.set('pref.newEpisodePush', '1');
    const r = await render(createElement(PushSettings));
    const on = hosts(r, (n) => flat(n)['backgroundColor'] === settingsColour.wash);
    expect(on.length).toBeGreaterThan(0);
  });
});
