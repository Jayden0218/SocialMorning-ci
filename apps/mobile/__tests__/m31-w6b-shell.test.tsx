// Tests that the appeal, maintenance, scan and crashed-screen pages match their drawings in the numbers the owner compared.
/**
 * M31 W6-B (T071; "the design I want completely the same, or you can explain why it is different"). Source of every number:
 * specs/033-m31-redesign/design-pulse2/shell.html `appeal--*`, `toast--appeal`, `maintenance--screen`, `error-boundary--screen`,
 * `scan--screen`, `scan--camera-denied`, `scan--camera-preview`. The drawing is a 390 x 844 phone with a 50 pt status bar; the test
 * phone has a 47 pt one (`below(47, y)` = y - 3). Each test names the revert that turns it red (each was seen red once, then restored):
 *  - the paused curve leaves its gap: drop `gapRange` in Curve.tsx - red (the bars in the gap are drawn);
 *  - the crashed page: curve 120 tall at 170, the 52 "!" disc, the full-width 52 Try again: change any measure in ErrorScreen / measures.ts - red;
 *  - maintenance: curve 150 at 150, marks LIVE / PAUSED / BACK, Play your downloads (52) over a 52 back circle and Check again: same;
 *  - appeal: ONE "Send appeal" pill, for the focused card (the first open one until another is focused) - red if the per-card button comes back;
 *  - scan: the 240 frame with a 124 tile; the camera window 358 tall, 16 in; Close / Torch - same.
 * NOT VERIFIED: the look on a phone (nothing here was seen in a browser or on a device).
 */
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockToast = jest.fn();
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: () => mockBack(), replace: (...a: unknown[]) => mockReplace(...a), canGoBack: () => mockCanGoBack },
  useRouter: () => ({ push: jest.fn(), back: () => mockBack(), replace: (...a: unknown[]) => mockReplace(...a), canGoBack: () => mockCanGoBack }),
  usePathname: () => '/appeal',
}));
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
const mockStores = { settings: { get: () => undefined } };
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockStores, useToast: () => mockToast }));
let mockPermission: { granted: boolean; canAskAgain: boolean } | null = null;
const mockAsk = jest.fn();
jest.mock('@/playback/expo-audio-adapter', () => ({}));
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [mockPermission, mockAsk] }));
const mockList = jest.fn();
const mockSend = jest.fn();
// One object for every render, as the real hook's useMemo gives (a new one each time would reload forever).
const mockApi = { list: () => mockList(), send: (...a: unknown[]) => mockSend(...a) };
jest.mock('@/social/appeals-api', () => ({ ...jest.requireActual('@/social/appeals-api'), useAppealsApi: () => mockApi }));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })) }));

import AppealScreen from '../app/appeal';
import MaintenanceScreen from '../app/maintenance';
import ScanScreen from '../app/scan';
import { ErrorScreen } from '@/ui/paused/ErrorScreen';
import { appealCaption, appealState, dayMonth } from '@/ui/appeal/lines';
import { ApiError } from '@/social/api';

const INSETS = { top: 47, bottom: 34, left: 0, right: 0 };
jest.useFakeTimers();
afterAll(() => { jest.clearAllTimers(); });
const rendered: ReactTestRenderer[] = [];
afterEach(() => {
  for (const r of rendered.splice(0)) act(() => r.unmount());
  for (const f of [mockReplace, mockBack, mockToast, mockAsk, mockList, mockSend]) f.mockReset();
  mockCanGoBack = true; mockPermission = null;
});
const mount = async (C: () => React.ReactElement | null): Promise<ReactTestRenderer> => {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(createElement(SafeAreaInsetsContext.Provider, { value: INSETS }, createElement(C))); });
  await act(async () => { await Promise.resolve(); });
  rendered.push(r);
  return r;
};
const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props['style']) ?? {}) as Record<string, unknown>;
const byId = (r: ReactTestRenderer, id: string) => r.root.findAll((n) => n.props['testID'] === id && typeof n.type === 'string');
/** The pressable named `label`, once (a kit part nests several wrappers that repeat its props). */
const pressables = (r: ReactTestRenderer, label: string) => r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.type !== 'string' && n.props['accessibilityRole'] === 'button' && !(n.parent?.props['accessibilityLabel'] === label && n.parent?.props['accessibilityRole'] === 'button'));
/** The drawn size of a control: the first style under it (or on it) that sets a height. */
const sized = (n: ReactTestInstance): Record<string, unknown> => [n, ...n.findAll((x) => typeof x.type === 'string')].map(flat).find((st) => st['height'] !== undefined) ?? {};
const press = async (r: ReactTestRenderer, label: string) => { const n = pressables(r, label)[0]; if (!n) throw new Error(`no pressable "${label}"`); await act(async () => { n.props['onPress'](); }); };
const text = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());
/** The test phone's status bar is 47, the drawing's 50. */
const at = (drawnTop: number) => 47 + drawnTop - 50;
/** A bar of the curve is transparent when it sits in the gap. */
const gapBars = (r: ReactTestRenderer) => byId(r, 'curve-bar').filter((b) => flat(b)['backgroundColor'] === 'rgba(6,6,8,0)').length;

describe('the appeal words (lines.ts)', () => {
  it('a caption is the decision and its day; a state line says not sent, waiting, or decided', () => {
    expect(dayMonth('2026-10-12T09:00:00.000Z')).toBe('12 Oct');
    expect(appealCaption({ action: 'remove', what: 'Your comment “hm” was removed', at: '2026-10-12T09:00:00.000Z' })).toBe('Comment removed · 12 Oct');
    expect(appealCaption({ action: 'suspend', what: 'Your account was suspended', at: '2026-10-09T09:00:00.000Z' })).toBe('Account suspended · 9 Oct');
    expect(appealState({ appeal: null })).toEqual({ sent: false, text: 'Not appealed yet' });
    expect(appealState({ appeal: { id: 'p', state: 'open', createdAt: 't' } }).text).toBe('Appeal sent — waiting for a decision');
    expect(appealState({ appeal: { id: 'p', state: 'rejected', createdAt: 't' } }).text).toBe('Appeal not accepted');
  });
});

describe('the crashed page (error-boundary--screen)', () => {
  it('curve 120 tall at 170 with a gap at 15-24 (10 bars), the 52 hot "!" disc, the words, and Try again full width (52) that retries', async () => {
    const retry = jest.fn();
    const r = await mount(() => createElement(ErrorScreen, { retry }));
    const bars = byId(r, 'curve-bar');
    expect(bars).toHaveLength(40);
    expect(gapBars(r)).toBe(10);
    const curve = r.root.findAll((n) => typeof n.type === 'string' && flat(n)['top'] === at(170) && flat(n)['left'] === 20);
    expect(curve.length).toBeGreaterThan(0);
    const curveBox = r.root.findAll((n) => typeof n.type === 'string' && flat(n)['height'] === 120 && flat(n)['gap'] === 3)[0];
    expect(curveBox).toBeDefined();
    const disc = byId(r, 'error-disc')[0]!;
    expect([flat(disc)['width'], flat(disc)['height'], flat(disc)['top']]).toEqual([52, 52, at(205)]);
    expect(text(r)).toContain('Something went wrong');
    expect(text(r)).toContain('This screen stopped working. Your listening and downloads are safe.');
    const button = pressables(r, 'Try again')[0]!;
    expect(sized(button)['height']).toBe(52);
    await press(r, 'Try again');
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('maintenance (maintenance--screen)', () => {
  it('curve 150 tall at 150 (gap 17-22 = 6 bars), the marks, and the words low', async () => {
    const r = await mount(MaintenanceScreen);
    expect(gapBars(r)).toBe(6);
    expect(byId(r, 'curve-bar')).toHaveLength(40);
    expect(r.root.findAll((n) => typeof n.type === 'string' && flat(n)['top'] === at(150) && flat(n)['left'] === 20).length).toBeGreaterThan(0);
    const t = text(r);
    for (const w of ['LIVE', 'PAUSED', 'We’ll be right back', 'SocialNet is being updated.', 'Your downloaded episodes still play while we work.']) expect(t).toContain(w);
  });

  it('Play your downloads (52) opens Downloads; the back circle is 52 and leaves; Check again is 52 beside it', async () => {
    const r = await mount(MaintenanceScreen);
    expect(sized(pressables(r, 'Play your downloads')[0]!)['height']).toBe(52);
    expect(sized(pressables(r, 'Check again')[0]!)['height']).toBe(52);
    const back = pressables(r, 'Back')[0]!;
    expect([sized(back)['width'], sized(back)['height']]).toEqual([52, 52]);
    await press(r, 'Play your downloads');
    expect(mockReplace).toHaveBeenCalledWith('/downloads');
    await press(r, 'Back');
    expect(mockBack).toHaveBeenCalledTimes(1);
    mockCanGoBack = false;
    await press(r, 'Back');
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('Check again asks /v1/health once and shows "Checking…" meanwhile; maintenance over - it leaves', async () => {
    let done!: (v: unknown) => void;
    const fetchMock = jest.fn(() => new Promise((res) => { done = res; }));
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    const r = await mount(MaintenanceScreen);
    await press(r, 'Check again');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(text(r)).toContain('Checking…');
    await act(async () => { done({ json: () => Promise.resolve({ ok: true }) }); await Promise.resolve(); await Promise.resolve(); });
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('appeal (appeal--screen, --nothing-to-appeal, --signed-out, toast--appeal)', () => {
  const two = [
    { actionId: 'a1', action: 'remove', what: 'Your comment “hm” was removed', at: '2026-10-12T09:00:00.000Z', appeal: null },
    { actionId: 'a2', action: 'remove', what: 'Your comment “ok” was removed', at: '2026-10-11T09:00:00.000Z', appeal: null },
    { actionId: 'a3', action: 'suspend', what: 'Your account was suspended', at: '2026-10-09T09:00:00.000Z', appeal: { id: 'p', state: 'open', createdAt: '2026-10-09T10:00:00.000Z' } },
  ];
  const fill = async (r: ReactTestRenderer, label: string, value: string) => {
    const box = r.root.findAll((n) => n.props['accessibilityLabel'] === label && typeof n.props['onChangeText'] === 'function')[0]!;
    await act(async () => { box.props['onFocus']?.(); box.props['onChangeText'](value); });
  };

  it('cards from 106 in the lane 28 from the left, 22 round, padded 16; a sent card shows its state with no box; ONE Send appeal pill', async () => {
    mockList.mockResolvedValue(two);
    const r = await mount(AppealScreen);
    const cards = byId(r, 'appeal-card');
    expect(cards).toHaveLength(3);
    expect([flat(cards[0]!)['borderRadius'], flat(cards[0]!)['padding']]).toEqual([22, 16]);
    const lane = r.root.findAll((n) => typeof n.type === 'string' && flat(n)['left'] === 28 && flat(n)['right'] === 16 && flat(n)['top'] === at(156));
    expect(lane.length).toBeGreaterThan(0);
    const t = text(r);
    expect(t).toContain('Comment removed · 12 Oct');
    expect(t).toContain('Account suspended · 9 Oct');
    expect(t).toContain('Appeal sent — waiting for a decision');
    expect(t).toContain('Not appealed yet');
    expect(t).toContain('0 / 1000');
    expect(r.root.findAll((n) => typeof n.type === 'string' && typeof n.props['onChangeText'] === 'function' && String(n.props['accessibilityLabel']).startsWith('Your appeal:'))).toHaveLength(2);
    expect(pressables(r, 'Send appeal')).toHaveLength(1);
  });

  it('Send appeal is dimmed while the focused box is empty; it sends the card whose box has focus, then says "Appeal sent." and reloads', async () => {
    mockList.mockResolvedValue(two);
    mockSend.mockResolvedValue(undefined);
    const r = await mount(AppealScreen);
    expect(pressables(r, 'Send appeal')[0]!.props['disabled']).toBe(true);
    await fill(r, 'Your appeal: Your comment “ok” was removed', 'Please look again.');
    expect(pressables(r, 'Send appeal')[0]!.props['disabled']).toBe(false);
    expect(text(r)).toContain('18 / 1000');
    await press(r, 'Send appeal');
    expect(mockSend).toHaveBeenCalledWith('a2', 'Please look again.');
    expect(mockToast).toHaveBeenCalledWith('Appeal sent.');
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('a second appeal on the same decision: "You already appealed this."; any other failure: "Couldn\'t send. Try again."', async () => {
    mockList.mockResolvedValue(two);
    mockSend.mockRejectedValueOnce(new ApiError('conflict', 'x', 409)).mockRejectedValueOnce(new Error('net'));
    const r = await mount(AppealScreen);
    await fill(r, 'Your appeal: Your comment “hm” was removed', 'Again.');
    await press(r, 'Send appeal');
    expect(mockToast).toHaveBeenLastCalledWith('You already appealed this.');
    await press(r, 'Send appeal');
    expect(mockToast).toHaveBeenLastCalledWith("Couldn't send. Try again.");
  });

  it('nothing to appeal: a 96 check tile tilted -6 and the sentence; no Send pill', async () => {
    mockList.mockResolvedValue([]);
    const r = await mount(AppealScreen);
    const tile = byId(r, 'glow-tile')[0]!;
    expect([flat(tile)['width'], flat(tile)['height']]).toEqual([96, 96]);
    expect(flat(tile)['transform']).toEqual([{ rotate: '-6deg' }]);
    expect(text(r)).toContain('Nothing to appeal');
    expect(text(r)).toContain('No removals or suspensions on your account.');
    expect(pressables(r, 'Send appeal')).toHaveLength(0);
  });

  it('signed out: the sentence in a card with a lock, no button', async () => {
    mockList.mockRejectedValue(new ApiError('unauthenticated', 'x', 401));
    const r = await mount(AppealScreen);
    expect(text(r)).toContain('Sign in to see what you can appeal.');
    expect(byId(r, 'appeal-card')).toHaveLength(1);
    expect(byId(r, 'icon-lock-closed-outline').length + r.root.findAll((n) => n.props['name'] === 'lock-closed-outline').length).toBeGreaterThan(0);
    expect(pressables(r, 'Send appeal')).toHaveLength(0);
  });
});

describe('scan (scan--screen, scan--camera-denied, scan--camera-preview)', () => {
  it('the permission is not known yet: a plain void page, nothing else', async () => {
    mockPermission = null;
    const r = await mount(ScanScreen);
    expect(text(r)).not.toContain('Scan a QR code');
    expect(pressables(r, 'Close')).toHaveLength(0);
  });

  it('not allowed yet: the 240 frame at 110 holds the 124 tile, the title and reason are low, Close is a 52 circle beside Allow camera (52), which asks', async () => {
    mockPermission = { granted: false, canAskAgain: true };
    const r = await mount(ScanScreen);
    const frame = byId(r, 'scan-frame')[0]!;
    expect([flat(frame)['width'], flat(frame)['height'], flat(frame)['top']]).toEqual([240, 240, at(110)]);
    const tile = byId(r, 'glow-tile')[0]!;
    expect([flat(tile)['width'], flat(tile)['height']]).toEqual([124, 124]);
    expect(text(r)).toContain('SocialNet needs the camera to read a QR code. It is used only on this screen, and nothing is recorded.');
    const close = pressables(r, 'Close')[0]!;
    expect([sized(close)['width'], sized(close)['height']]).toEqual([52, 52]);
    expect(sized(pressables(r, 'Allow camera')[0]!)['height']).toBe(52);
    await press(r, 'Allow camera');
    expect(mockAsk).toHaveBeenCalledTimes(1);
    await press(r, 'Close');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('refused for good: Close beside the hot sentence; no Allow camera', async () => {
    mockPermission = { granted: false, canAskAgain: false };
    const r = await mount(ScanScreen);
    expect(text(r)).toContain("Camera access is off. Turn it on for SocialNet in your phone's Settings.");
    expect(pressables(r, 'Allow camera')).toHaveLength(0);
    expect(pressables(r, 'Close')).toHaveLength(1);
  });

  it('allowed: the camera window is 358 tall, 16 in, 58 down; "Scan QR code" over Close and Torch; Torch turns hot and says "Torch on"', async () => {
    mockPermission = { granted: true, canAskAgain: true };
    const r = await mount(ScanScreen);
    const win = byId(r, 'scan-window')[0]!;
    expect([flat(win)['height'], flat(win)['left'], flat(win)['right'], flat(win)['top'], flat(win)['borderRadius']]).toEqual([358, 16, 16, at(58), 32]);
    expect(text(r)).toContain('Scan QR code');
    expect(text(r)).toContain('Point at a QR code');
    expect(text(r)).toContain('Clip, episode and show codes open right here');
    expect(pressables(r, 'Turn the torch on')).toHaveLength(1);
    await press(r, 'Turn the torch on');
    expect(pressables(r, 'Turn the torch off')).toHaveLength(1);
    expect(text(r)).toContain('Torch on');
    await press(r, 'Close');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

it('a failed load that is not "signed out" says so in hot-text, with no Send pill', async () => {
  mockList.mockRejectedValue(new Error('net'));
  const r = await mount(AppealScreen);
  expect(text(r)).toContain("Couldn't load your appeals. Try again later.");
  expect(pressables(r, 'Send appeal')).toHaveLength(0);
});
