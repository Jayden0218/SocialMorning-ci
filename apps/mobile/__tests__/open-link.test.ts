// Tests where a tapped link goes: the in-app browser, a screen of our own, or the system.
/** M22 US7 (FR-025). The break that turns it red: return `{ kind: 'system' }` for every http(s) link in `linkTarget`. */
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { linkTarget, openLink } from '@/ui/kit/openLink';

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
  expect(linkTarget('javascript:alert(1)', API).kind).toBe('none');
  expect(linkTarget('socialmorning://', API).kind).toBe('none');
});

it('openLink uses the in-app browser for a web page and the router for our own', async () => {
  await openLink('https://example.com');
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ dismissButtonStyle: 'close' }));
  await openLink('socialmorning://show/x');
  expect(router.push).toHaveBeenCalledWith('/show/x');
});
