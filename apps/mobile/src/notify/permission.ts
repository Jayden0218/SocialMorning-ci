/**
 * Notification permission (owner, 2026-09-27): asked when the sign-in page opens.
 *
 * Asked once. When the answer is already known (allowed or refused), nothing is shown —
 * iOS would not show the prompt a second time anyway, and Android would, which is nagging.
 * Android 13+ shows no prompt until a channel exists (Expo's docs), so the channel is made
 * first. A failure here never blocks signing in.
 */
export type PermissionState = 'granted' | 'denied' | 'undetermined';

export type NotifyApi = {
  os: string;
  status(): Promise<PermissionState>;
  createChannel(): Promise<unknown>;
  request(): Promise<unknown>;
};

export async function askForNotifications(api: NotifyApi): Promise<'asked' | 'known' | 'failed'> {
  try {
    if ((await api.status()) !== 'undetermined') return 'known';
    if (api.os === 'android') await api.createChannel();
    await api.request();
    return 'asked';
  } catch {
    return 'failed';
  }
}
