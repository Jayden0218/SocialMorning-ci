/**
 * M10b US3 on the phone: the push address joins the account only when there is one
 * (permission granted), is remembered, and is removed at sign-out; nothing here can fail
 * a sign-in. The break that turns the first test red: in `src/notify/push-token.ts`
 * `registerPush`, skip `d.settings.set(PUSH_TOKEN_KEY, t)`.
 */
import { hash } from '../src/feeds/hash';
import { PUSH_TOKEN_KEY, registerPush, unregisterPush } from '../src/notify/push-token';
import { createMemoryStores } from '../src/storage/memory';

it('granted: the address is sent with the platform and remembered; sign-out removes exactly it', async () => {
  const { settings } = createMemoryStores(hash);
  const add = jest.fn(async () => undefined);
  const remove = jest.fn(async () => undefined);
  expect(await registerPush({ token: async () => 'ExponentPushToken[abc12345]', add, remove, settings, platform: 'ios' })).toBe('sent');
  expect(add).toHaveBeenCalledWith('ExponentPushToken[abc12345]', 'ios');
  expect(settings.get(PUSH_TOKEN_KEY)).toBe('ExponentPushToken[abc12345]');
  await unregisterPush({ remove, settings });
  expect(remove).toHaveBeenCalledWith('ExponentPushToken[abc12345]');
  expect(settings.get(PUSH_TOKEN_KEY)).toBe('');
});

it('no permission → nothing sent; a failing server never throws; sign-out with no address does nothing', async () => {
  const { settings } = createMemoryStores(hash);
  const add = jest.fn(async () => { throw new Error('offline'); });
  const remove = jest.fn(async () => undefined);
  expect(await registerPush({ token: async () => undefined, add, remove, settings, platform: 'android' })).toBe('none');
  expect(add).not.toHaveBeenCalled();
  expect(await registerPush({ token: async () => 'ExponentPushToken[zzz12345]', add, remove, settings, platform: 'android' })).toBe('failed');
  await unregisterPush({ remove, settings });
  expect(remove).not.toHaveBeenCalled();
});
