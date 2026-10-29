// Opens a link the right way: web pages in the in-app browser, our own links in the app, the rest by the system.
/**
 * M22 US7 (FR-025, research R6). One helper for every web link a listener taps — show notes,
 * show info, chapters:
 *   - `socialmorning://…` and our own web pages (`/e/:id`, `/c/:id` on the API's address) open
 *     the screen in the app (router);
 *   - any other http(s) page opens in the in-app browser (expo-web-browser: Chrome Custom Tabs /
 *     SFSafariViewController) in our colours, with its own Close and "Open in browser";
 *   - `mailto:`, `tel:` and store links go to the system, as before.
 * M32 B7 / M31 T083: every outside link goes through here. `socialmorning://` links pass `linkAllow`
 * (content screens only); a scheme not listed (javascript:, data:, file:, intent:, content:, ftp: …)
 * is `blocked` and the caller's `onBlocked` runs (the app says "Can't open that link."). The chat-app
 * hand-offs of the share panel (whatsapp, tg, weixin, twitter) and `sms:` are listed.
 * A link that fails to open is dropped quietly, as `Linking.openURL(...).catch(() => undefined)` did.
 */
import { Linking } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { colour } from '@/design';
import { apiBaseUrl } from '@/social/base-url';
import { linkAllow } from '@/outside/link-allow';

export type LinkTarget = { kind: 'app'; path: string } | { kind: 'web'; url: string } | { kind: 'system'; url: string } | { kind: 'blocked' } | { kind: 'none' };

/** The chat apps the share panel opens (`share-targets.ts`). */
const CHAT = /^(?:whatsapp|tg|weixin|twitter):\/\//i;

const STORE = /^(?:market:|itms-apps:|itms-appss:|https:\/\/(?:play\.google\.com|apps\.apple\.com|itunes\.apple\.com)\/)/i;

/** Where a tapped link should go. Pure, so the rules are tested without a phone. */
export function linkTarget(raw: string, apiBase: string = apiBaseUrl()): LinkTarget {
  const url = raw.trim();
  if (url === '') return { kind: 'none' };
  if (/^socialmorning:/i.test(url)) {
    const a = linkAllow(url);
    return a.kind === 'app' ? { kind: 'app', path: a.path } : { kind: 'blocked' };
  }
  if (/^(?:mailto|tel|sms):/i.test(url) || CHAT.test(url) || STORE.test(url)) return { kind: 'system', url };
  if (!/^https?:\/\/[^\s]+$/i.test(url)) return { kind: 'blocked' };
  const base = apiBase.replace(/\/+$/, '');
  if (base !== '' && url.toLowerCase().startsWith(`${base.toLowerCase()}/`)) {
    const rest = url.slice(base.length);
    const m = /^\/(e|c)\/([\w-]{1,64})(?:\?t=(\d+))?$/.exec(rest);
    if (m) return { kind: 'app', path: m[1] === 'e' ? `/episode/${m[2]}${m[3] ? `?t=${m[3]}` : ''}` : `/clip/${m[2]}` };
  }
  return { kind: 'web', url };
}

/** Open `url` by the rules above. Never throws; `onBlocked` runs when the link is refused. */
export async function openLink(url: string, onBlocked?: () => void): Promise<void> {
  const t = linkTarget(url);
  if (t.kind === 'blocked') { onBlocked?.(); return; }
  try {
    if (t.kind === 'app') router.push(t.path as never);
    else if (t.kind === 'system') await Linking.openURL(t.url);
    else if (t.kind === 'web') {
      await WebBrowser.openBrowserAsync(t.url, {
        toolbarColor: colour.background,
        controlsColor: colour.accent,
        secondaryToolbarColor: colour.surface,
        dismissButtonStyle: 'close',
        showTitle: true,
        enableBarCollapsing: true,
      });
    }
  } catch {
    // A page that cannot open is not an error the listener can act on.
  }
}

/**
 * Hand a link to the phone (mail, store, a chat app, a web address in the browser app) when the
 * rules allow it. Resolves true when it was handed over; a blocked link runs `onBlocked` and
 * resolves false. The phone's own failure still rejects, so each caller keeps its own message.
 */
export async function openSystem(url: string, onBlocked?: () => void): Promise<boolean> {
  const t = linkTarget(url);
  if (t.kind === 'system' || t.kind === 'web') { await Linking.openURL(url.trim()); return true; }
  onBlocked?.();
  return false;
}

/** The words for a refused link. */
export const LINK_REFUSED = "Can't open that link.";
