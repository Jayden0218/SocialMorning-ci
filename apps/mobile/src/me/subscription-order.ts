// Keeps my own order of subscriptions on the phone and in step with the server.
/**
 * M21 US8 (FR-072): the "Default" sort. The order lives in settings (`subscriptions.order`, a JSON
 * list of feed URLs) so the page sorts without a network call. Saving writes it here first and
 * marks it unsent; the push clears the mark. A pull only takes the server's order when nothing
 * is waiting to be sent, so an offline change is never overwritten by an older server copy.
 */
import type { SettingsStore } from '@/storage/types';

export const ORDER_KEY = 'subscriptions.order';
export const ORDER_DIRTY_KEY = 'subscriptions.order.unsent';

type OrderApi = { subscriptionOrder(): Promise<string[]>; setSubscriptionOrder(feedUrls: readonly string[]): Promise<void> };

export function readOrder(s: Pick<SettingsStore, 'get'>): string[] {
  try {
    const v: unknown = JSON.parse(s.get(ORDER_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Saves locally, then pushes; a failed push stays marked for the next `syncOrder`. */
export async function saveOrder(s: SettingsStore, api: OrderApi, order: readonly string[], signedIn: boolean): Promise<void> {
  s.set(ORDER_KEY, JSON.stringify(order));
  s.set(ORDER_DIRTY_KEY, '1');
  if (!signedIn) return;
  try {
    await api.setSubscriptionOrder(order);
    s.set(ORDER_DIRTY_KEY, '0');
  } catch {
    /* kept unsent; the next syncOrder sends it */
  }
}

/** On opening My subscriptions: send an unsent order, else take the server's. Never throws. */
export async function syncOrder(s: SettingsStore, api: OrderApi): Promise<string[]> {
  try {
    if (s.get(ORDER_DIRTY_KEY) === '1') {
      await api.setSubscriptionOrder(readOrder(s));
      s.set(ORDER_DIRTY_KEY, '0');
    } else {
      s.set(ORDER_KEY, JSON.stringify(await api.subscriptionOrder()));
    }
  } catch {
    /* offline: the local order stands */
  }
  return readOrder(s);
}
