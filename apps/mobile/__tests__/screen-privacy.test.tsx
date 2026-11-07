// Renders Settings > Privacy with real stores: the listening switch, "What others see", muted users, Download my data.
/**
 * M32 T060 (review F1). Break to watch red: throw in `PrivacySettings`; make `change` skip
 * `profile.update`; make `unmute` skip `extras.unmute`; make `setPrivacy` skip `api.setPrivacy`.
 */
import { createElement } from 'react';
import { act } from 'react-test-renderer';
import { allText, hash, mount, press } from './support/screen-kit';
import { createMemoryStores } from '@/storage/memory';

const mockRef: { stores: ReturnType<typeof createMemoryStores>; listener: { listenerId: string } | undefined } = { stores: undefined as never, listener: undefined };
const mockToast = jest.fn();
const mockApi = { me: jest.fn(() => Promise.resolve({ privateListening: false })), setPrivacy: jest.fn(() => Promise.resolve()) };
const mockProfile = {
  me: jest.fn(() => Promise.resolve({ hideBadge: true, hideStickers: false, hideDecorations: false, privateSubscriptions: false })),
  update: jest.fn(() => Promise.resolve()),
};
const mockExtras = {
  mutes: jest.fn(() => Promise.resolve([{ id: 'm1', name: 'Noisy Nick', avatarUrl: null }])),
  unmute: jest.fn(() => Promise.resolve()),
};
const mockAccount = { requestDataExport: jest.fn(() => Promise.resolve({ expiresInHours: 24 })) };
jest.mock('@/ui/shell/toastPlacement', () => ({ useToastPlacement: () => ({ tabs: false, now: false, player: false }) }));
jest.mock('expo-router', () => {
  const { createElement } = require('react');
  return { usePathname: () => '/', useIsFocused: () => true,  Link: (p: { children?: unknown }) => createElement(require('react-native').View, null, p.children) };
});
const mockSocial = { get api() { return mockApi; }, get listener() { return mockRef.listener; } };
jest.mock('@/social/context', () => ({ useSocial: () => mockSocial }));
jest.mock('@/ui/shell/providers', () => ({ useStores: () => mockRef.stores, useToast: () => mockToast }));
jest.mock('@/social/profile-api', () => {
  const actual = jest.requireActual('@/social/profile-api');
  return { ...actual, useProfileApi: () => mockProfile };
});
jest.mock('@/social/comment-extras-api', () => ({ useCommentExtrasApi: () => mockExtras }));
jest.mock('@/social/account-api', () => ({ useAccountApi: () => mockAccount }));
jest.mock('@/ui/social/MutedThreads', () => ({ MutedThreads: () => null }));
jest.mock('@/ui/settings/OftenListenedSwitch', () => ({ OftenListenedSwitch: () => null }));
// The real switch runs a native animation that outlives the test; same props, same press behaviour.
jest.mock('@/ui/kit/Toggle', () => {
  const { createElement } = require('react');
  const { Pressable } = require('react-native');
  return {
    Toggle: (p: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) =>
      createElement(Pressable, { onPress: () => { if (!p.disabled) p.onChange(!p.value); }, accessibilityRole: 'switch', accessibilityLabel: p.label, accessibilityState: { checked: p.value, disabled: p.disabled === true } }),
  };
});

import PrivacySettings from '../app/settings/privacy';

const switchState = (r: Awaited<ReturnType<typeof mount>>, label: string) =>
  r.root.findAll((n) => n.props['accessibilityLabel'] === label && n.props['accessibilityRole'] === 'switch')[0]?.props['accessibilityState'] as { checked: boolean };

beforeEach(() => {
  mockRef.stores = createMemoryStores(hash);
  mockRef.listener = { listenerId: 'me' };
  for (const m of [mockToast, mockApi.setPrivacy, mockProfile.update, mockExtras.unmute, mockAccount.requestDataExport]) m.mockClear();
});

it('signed out: asks to sign in and shows only the always-public line and Blocked listeners', async () => {
  mockRef.listener = undefined;
  const r = await mount(createElement(PrivacySettings));
  const t = allText(r);
  expect(t).toContain('Privacy');
  expect(t).toContain('Sign in to choose who sees your listening.');
  expect(t).toContain('Blocked listeners');
  expect(t).not.toContain('OTHERS SEE');
});

it('signed in: shows the sections, with the server\'s switch values', async () => {
  const r = await mount(createElement(PrivacySettings));
  const t = allText(r);
  for (const s of ['Keep my listening private', 'OTHERS SEE', 'MUTED USERS', 'THREADS', 'Download my data', 'Noisy Nick']) expect(t).toContain(s);
  expect(switchState(r, 'Hide my listening badge').checked).toBe(true);
  expect(switchState(r, 'Hide my sticker library').checked).toBe(false);
});

it('flipping a "What others see" switch sends that one field; a refusal puts it back and says so', async () => {
  const r = await mount(createElement(PrivacySettings));
  await press(r, 'Hide my sticker library');
  expect(mockProfile.update).toHaveBeenCalledWith({ hideStickers: true });
  expect(switchState(r, 'Hide my sticker library').checked).toBe(true);
  mockProfile.update.mockImplementationOnce(() => Promise.reject(new Error('offline')));
  await press(r, 'Hide my profile decorations');
  await act(async () => { await Promise.resolve(); });
  expect(switchState(r, 'Hide my profile decorations').checked).toBe(false);
  expect(mockToast).toHaveBeenCalledWith("Couldn't save that — try again when you're online.");
});

it('the listening switch saves to the server and keeps the phone\'s copy', async () => {
  const r = await mount(createElement(PrivacySettings));
  await press(r, 'Keep my listening private');
  expect(mockApi.setPrivacy).toHaveBeenCalledWith(true);
  expect(mockRef.stores.settings.get('me.privateListening')).toBe('1');
  expect(allText(r)).toContain('On — your listening is private');
});

it('Unmute removes the listener from the list and says so', async () => {
  const r = await mount(createElement(PrivacySettings));
  await press(r, 'Unmute Noisy Nick');
  expect(mockExtras.unmute).toHaveBeenCalledWith('m1');
  expect(mockToast).toHaveBeenCalledWith('Noisy Nick is unmuted.');
  expect(allText(r)).toContain('You have not muted anyone.');
});

it('Download my data asks the server and tells you the link\'s lifetime', async () => {
  const r = await mount(createElement(PrivacySettings));
  await press(r, 'Email me a link to my data');
  expect(mockAccount.requestDataExport).toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith('We emailed you a link. It works for 24 hours.');
});
