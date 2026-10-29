// Tests where a tapped link goes: the in-app browser, a screen of our own, or the system.
/** M22 US7 (FR-025). The break that turns it red: return `{ kind: 'system' }` for every http(s) link in `linkTarget`. */
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { Linking } from 'react-native';
import { linkTarget, openLink, openSystem } from '@/ui/kit/openLink';

const API = 'https://socialmorning-api.vercel.app';

it('a web page opens in the in-app browser', () => {
  expect(linkTarget('https://example.com/page?a=1', API)).toEqual({ kind: 'web', url: 'https://example.com/page?a=1' });
  expect(linkTarget('http://example.com', API)).toEqual({ kind: 'web', url: 'http://example.com' });
});

it('our own links open the screen in the app', () => {
  expect(linkTarget('socialmorning://episode/abc', API)).toEqual({ kind: 'app', path: '/episode/abc' });
  expect(linkTarget(`${API}/e/abc123`, API)).toEqual({ kind: 'app', path: '/episode/abc123' });
  expect(linkTarget(`${API}/e/abc123?t=90000`, API)).toEqual({ kind: 'app', path: '/episode/abc123?t=90000' });
  expect(linkTarget(`${API}/c/0b9e7a7e-1111-2222-3333-444455556666`, API)).toEqual({ kind: 'app', path: '/clip/0b9e7a7e-1111-2222-3333-444455556666' });
  expect(linkTarget(`${API}/l/abcdefghij`, API)).toEqual({ kind: 'web', url: `${API}/l/abcdefghij` });
});

it('mail, phone and store links go to the system; anything else is ignored', () => {
  expect(linkTarget('mailto:a@b.com', API).kind).toBe('system');
  expect(linkTarget('tel:+123', API).kind).toBe('system');
  expect(linkTarget('https://apps.apple.com/app/id1', API).kind).toBe('system');
  expect(linkTarget('market://details?id=x', API).kind).toBe('system');
  expect(linkTarget('', API).kind).toBe('none');
  expect(linkTarget('javascript:alert(1)', API).kind).toBe('blocked');
  expect(linkTarget('socialmorning://', API).kind).toBe('blocked');
});

it('the share targets, the phone\'s mail/sms and store hand-offs stay allowed', () => {
  for (const u of ['whatsapp://send?text=hi', 'tg://msg?text=hi', 'weixin://', 'twitter://post?message=hi', 'sms:&body=hi', 'sms:?body=hi', 'itms-apps://itunes.apple.com/app/id1', 'https://play.google.com/store/apps/details?id=x', 'https://apps.apple.com/account/subscriptions']) {
    expect(['system', 'web']).toContain(linkTarget(u, API).kind);
  }
});

it('B7: a publisher link may not reach an account screen of the app', () => {
  expect(linkTarget('socialmorning://gift/x', API).kind).toBe('blocked');
  expect(linkTarget('socialmorning://wallet', API).kind).toBe('blocked');
  expect(linkTarget('socialmorning://settings/account', API).kind).toBe('blocked');
  expect(linkTarget('socialmorning://show/x', API)).toEqual({ kind: 'app', path: '/show/x' });
});

describe('T083: openLink refuses what is not a link we may open, and says so', () => {
  beforeEach(() => { jest.clearAllMocks(); });
  it.each(['javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'intent://scan/#Intent;scheme=zxing;end', 'ftp://example.com/x', 'content://media/1', 'socialmorning://gift/x'])('%s', async (u) => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const refused = jest.fn();
    await openLink(u, refused);
    expect(refused).toHaveBeenCalledTimes(1);
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
  it('https://example.com is allowed and nothing is refused', async () => {
    const refused = jest.fn();
    await openLink('https://example.com', refused);
    expect(refused).not.toHaveBeenCalled();
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledTimes(1);
  });
  it('openSystem hands an allowed link to the phone and refuses a blocked one without calling it', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const refused = jest.fn();
    expect(await openSystem('mailto:a@b.com', refused)).toBe(true);
    expect(open).toHaveBeenCalledWith('mailto:a@b.com');
    expect(await openSystem('javascript:alert(1)', refused)).toBe(false);
    expect(refused).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
    open.mockRestore();
  });
});

it('openLink uses the in-app browser for a web page and the router for our own', async () => {
  await openLink('https://example.com');
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ dismissButtonStyle: 'close' }));
  await openLink('socialmorning://show/x');
  expect(router.push).toHaveBeenCalledWith('/show/x');
});
