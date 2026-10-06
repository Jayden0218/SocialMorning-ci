// Chat apps the share panel can send to directly, how to tell they are installed, and the link that opens each.
/**
 * M21 US2 (spec story 2, scenario 8): the share panel shows a row of the target apps that are on
 * this phone — found with `Linking.canOpenURL` on each app's own URL scheme. iOS answers only for
 * schemes listed in `ios.infoPlist.LSApplicationQueriesSchemes` (app.json), Android only for those
 * in the manifest's `<queries>` (plugins/share-queries.js); both lists are checked against
 * `SHARE_SCHEMES` by __tests__/share-targets.test.ts.
 *
 * WeChat has no link that carries text, so its button copies the message first and opens WeChat.
 */
import type { IconName } from '@/ui/kit/Icon';

export type ShareTarget = {
  id: 'whatsapp' | 'telegram' | 'wechat' | 'messages' | 'x';
  label: string;
  icon: IconName;
  /** The URL scheme asked about (and declared for iOS / Android). */
  scheme: string;
  /** What `canOpenURL` is asked. */
  probe: string;
  /** The link that opens the app with `text` ready to send. */
  url: (text: string, os: string) => string;
  /** The app takes no text in a link: copy the message, then open it. */
  copiesFirst?: true;
};

const enc = encodeURIComponent;

export const SHARE_TARGETS: readonly ShareTarget[] = [
  { id: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', scheme: 'whatsapp', probe: 'whatsapp://send', url: (t) => `whatsapp://send?text=${enc(t)}` },
  { id: 'telegram', label: 'Telegram', icon: 'paper-plane-outline', scheme: 'tg', probe: 'tg://msg', url: (t) => `tg://msg?text=${enc(t)}` },
  { id: 'wechat', label: 'WeChat', icon: 'logo-wechat', scheme: 'weixin', probe: 'weixin://', url: () => 'weixin://', copiesFirst: true },
  // iOS reads the body after `&`, Android after `?`.
  { id: 'messages', label: 'Messages', icon: 'chatbubble-outline', scheme: 'sms', probe: 'sms:', url: (t, os) => (os === 'ios' ? `sms:&body=${enc(t)}` : `sms:?body=${enc(t)}`) },
  { id: 'x', label: 'X', icon: 'logo-x', scheme: 'twitter', probe: 'twitter://post', url: (t) => `twitter://post?message=${enc(t)}` },
];

export const SHARE_SCHEMES: readonly string[] = SHARE_TARGETS.map((t) => t.scheme);

/** The targets this phone can open, in the panel's order. A failed probe counts as not installed. */
export async function installedTargets(canOpen: (url: string) => Promise<boolean>): Promise<ShareTarget[]> {
  const found = await Promise.all(SHARE_TARGETS.map(async (t) => {
    try { return (await canOpen(t.probe)) ? t : undefined; } catch { return undefined; }
  }));
  return found.filter((t): t is ShareTarget => t !== undefined);
}
