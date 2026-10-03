/**
 * Notification permission, asked on the sign-in page (owner, 2026-09-27). The break that
 * turns the first test red: delete the `!== 'undetermined'` early return in
 * `src/notify/permission.ts`.
 */
import { askForNotifications, type NotifyApi, type PermissionState } from '@/notify/permission';

function fake(os: string, state: PermissionState, fail = false): NotifyApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    os,
    status: async () => { calls.push('status'); if (fail) throw new Error('native'); return state; },
    createChannel: async () => { calls.push('channel'); },
    request: async () => { calls.push('request'); },
  };
}

it('an answer already given is not asked again', async () => {
  for (const state of ['granted', 'denied'] as const) {
    const api = fake('ios', state);
    expect(await askForNotifications(api)).toBe('known');
    expect(api.calls).toEqual(['status']);
  }
});

it('iOS: asks when not yet asked', async () => {
  const api = fake('ios', 'undetermined');
  expect(await askForNotifications(api)).toBe('asked');
  expect(api.calls).toEqual(['status', 'request']);
});

it('Android: makes a channel before asking, or 13+ shows no prompt', async () => {
  const api = fake('android', 'undetermined');
  expect(await askForNotifications(api)).toBe('asked');
  expect(api.calls).toEqual(['status', 'channel', 'request']);
});

it('a native failure does not throw into the sign-in page', async () => {
  expect(await askForNotifications(fake('ios', 'undetermined', true))).toBe('failed');
});
