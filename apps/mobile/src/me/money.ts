/**
 * M12 FR-105 / FR-106: a store amount for display. The stores report micros (1/1 000 000 of
 * the currency unit). No amount → an empty string, never "0".
 */
export function moneyLabel(amountMicros: number | null, currency: string | null): string {
  if (amountMicros === null) return '';
  const value = amountMicros / 1_000_000;
  if (!currency) return value.toFixed(2);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Where each store lets you manage or cancel a subscription — SocialNet never does it itself. */
export const MANAGE_SUBSCRIPTIONS = {
  ios: 'https://apps.apple.com/account/subscriptions',
  android: 'https://play.google.com/store/account/subscriptions',
} as const;
