// Tests the share panel's chat-app row: only installed apps, the right links, and every scheme declared for iOS and Android.
/**
 * M21 US2 (spec story 2, scenario 8). `canOpenURL` answers "no" for a scheme the app did not
 * declare, so a scheme missing from app.json (iOS) or plugins/share-queries.js (Android) makes
 * that app silently vanish from the row on a real phone.
 *
 * The break that turns it red: delete "tg" from `LSApplicationQueriesSchemes` in app.json.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installedTargets, SHARE_SCHEMES, SHARE_TARGETS } from '@/ui/clips/share-targets';

const ROOT = join(__dirname, '..');

it('only the apps the phone can open, in order; a probe that throws counts as not installed', async () => {
  const yes = new Set(['whatsapp://send', 'sms:']);
  const found = await installedTargets(async (u) => { if (u === 'tg://msg') throw new Error('no'); return yes.has(u); });
  expect(found.map((t) => t.id)).toEqual(['whatsapp', 'messages']);
});

it('the links carry the message, encoded; Messages differs by platform; WeChat copies first', () => {
  const by = (id: string) => SHARE_TARGETS.find((t) => t.id === id)!;
  const text = 'Ep 1 — Show\nhttps://x.test/e/1';
  expect(by('whatsapp').url(text, 'ios')).toBe(`whatsapp://send?text=${encodeURIComponent(text)}`);
  expect(by('telegram').url(text, 'ios')).toBe(`tg://msg?text=${encodeURIComponent(text)}`);
  expect(by('messages').url('a b', 'ios')).toBe('sms:&body=a%20b');
  expect(by('messages').url('a b', 'android')).toBe('sms:?body=a%20b');
  expect(by('x').url('a', 'ios')).toBe('twitter://post?message=a');
  expect(by('wechat').copiesFirst).toBe(true);
});

it('every scheme is declared for iOS (app.json) and Android (plugins/share-queries.js)', () => {
  const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));
  expect([...app.expo.ios.infoPlist.LSApplicationQueriesSchemes].sort()).toEqual([...SHARE_SCHEMES].sort());
  expect(app.expo.plugins).toContain('./plugins/share-queries');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const plugin = require(join(ROOT, 'plugins', 'share-queries.js')) as { SCHEMES: string[] };
  expect([...plugin.SCHEMES].sort()).toEqual([...SHARE_SCHEMES].sort());
});
