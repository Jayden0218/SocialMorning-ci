// Opens a link the right way: web pages in the in-app browser, our own links in the app, the rest by the system.
/**
 * M22 US7 (FR-025, research R6). One helper for every web link a listener taps — show notes,
 * show info, chapters:
 *   - `socialmorning://…` and our own web pages (`/e/:id`, `/c/:id` on the API's address) open
 *     the screen in the app (router);
 *   - any other http(s) page opens in the in-app browser (expo-web-browser: Chrome Custom Tabs /
 *     SFSafariViewController) in our colours, with its own Close and "Open in browser";
 *   - `mailto:`, `tel:` and store links go to the system, as before.
 * A link that fails to open is dropped quietly, as `Linking.openURL(...).catch(() => undefined)` did.
 */
import { Linking } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { colour } from '@/design';
import { apiBaseUrl } from '@/social/base-url';

export type LinkTarget = { kind: 'app'; path: string } | { kind: 'web'; url: string } | { kind: 'system'; url: string } | { kind: 'none' };

const STORE = /^(?:market:|itms-apps:|itms-appss:|https:\/\/(?:play\.google\.com|apps\.apple\.com|itunes\.apple\.com)\/)/i;

/** Where a tapped link should go. Pure, so the rules are tested without a phone. */
export function linkTarget(raw: string, apiBase: string = apiBaseUrl()): LinkTarget {
  const url = raw.trim();
  if (/^socialmorning:\/\//i.test(url)) {
    const path = url.replace(/^socialmorning:\/\//i, '/');
    return path === '/' ? { kind: 'none' } : { kind: 'app', path };
  }
  if (/^(?:mailto|tel|sms):/i.test(url) || STORE.test(url)) return { kind: 'system', url };
  if (!/^https?:\/\/[^\s]+$/i.test(url)) return { kind: 'none' };
  const base = apiBase.replace(/\/+$/, '');
  if (base !== '' && url.toLowerCase().startsWith(`${base.toLowerCase()}/`)) {
    const rest = url.slice(base.length);
    const m = /^\/(e|c)\/([\w-]{1,64})(?:\?t=(\d+))?$/.exec(rest);
    if (m) return { kind: 'app', path: m[1] === 'e' ? `/episode/${m[2]}${m[3] ? `?t=${m[3]}` : ''}` : `/clip/${m[2]}` };
  }
  return { kind: 'web', url };
}

/** Open `url` by the rules above. Never throws. */
export async function openLink(url: string): Promise<void> {
  const t = linkTarget(url);
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
