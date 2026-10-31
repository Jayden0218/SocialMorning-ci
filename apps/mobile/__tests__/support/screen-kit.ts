// Helpers for the screen render tests (M32 T060): real in-memory stores, mounting, reading text, pressing.
import { createElement, type ReactElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { createMemoryStores } from '@/storage/memory';
import type { Stores } from '@/storage/types';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { Episode, ParsedFeed } from '@socialmorning/feed-parser';

export const hash = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0').repeat(2);
};

export const FEED = 'https://example.com/show/feed.xml';

export function episode(guid: string, title: string, publishedAt: number, durationMs = 1_800_000): Episode {
  return {
    guid, guidSource: 'guid', title, enclosureUrl: `https://cdn.example.com/${guid}.mp3`, publishedAt, durationMs,
    explicit: false, transcripts: [], soundbites: [], contentHash: `h-${guid}`,
  };
}

/** A real memory store set with one show and the given episodes cached. */
export function seededStores(episodes: Episode[], showTitle = 'The Morning Show'): Stores {
  const stores = createMemoryStores(hash);
  const parsed: ParsedFeed = {
    show: { feedUrl: FEED, title: showTitle, explicit: false, categories: [], contentHash: 'sh' },
    episodes,
    warnings: [],
  };
  stores.feeds.put(FEED, parsed, {}, 1);
  return stores;
}

export async function mount(el: ReactElement | (() => ReactElement)): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  // M31: the Pulse pages read the safe-area insets (title bar, tab strip); a phone with a 47 / 34 notch and home bar.
  const inside = (e: ReactElement) => createElement(SafeAreaInsetsContext.Provider, { value: { top: 47, bottom: 34, left: 0, right: 0 } }, e);
  await act(async () => { r = create(inside(typeof el === 'function' ? el() : el)); });
  return r;
}
export const mountComponent = (C: () => ReactElement | null) => mount(createElement(C));

/** Every string the screen renders, joined. */
export function allText(r: ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === 'string') out.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === 'object') walk((n as { children?: unknown }).children);
  };
  walk(r.toJSON());
  return out.join(' | ');
}

export const labels = (r: ReactTestRenderer): string[] =>
  r.root.findAll((n) => typeof n.props['accessibilityLabel'] === 'string').map((n) => String(n.props['accessibilityLabel']));

export function byLabel(r: ReactTestRenderer, label: string | RegExp): ReactTestInstance {
  const hit = r.root.findAll((n) => {
    const l = n.props['accessibilityLabel'];
    return typeof l === 'string' && typeof n.props['onPress'] === 'function' && (typeof label === 'string' ? l === label : label.test(l));
  })[0];
  if (!hit) throw new Error(`nothing pressable labelled ${String(label)}; have: ${labels(r).join(' ; ')}`);
  return hit;
}

export async function press(r: ReactTestRenderer, label: string | RegExp): Promise<void> {
  const n = byLabel(r, label);
  await act(async () => { (n.props['onPress'] as (e?: unknown) => void)({ preventDefault: () => undefined }); });
}

/** The text under a test instance, joined. */
export function textOf(n: ReactTestInstance | string): string {
  return typeof n === 'string' ? n : n.children.map(textOf).join('');
}

/** Press the control whose visible text is exactly `text` (the last match: the topmost layer, e.g. a dialog). */
export async function pressText(r: ReactTestRenderer, text: string): Promise<void> {
  const hits = r.root.findAll((n) => typeof n.props['onPress'] === 'function' && textOf(n) === text);
  const n = hits[hits.length - 1];
  if (!n) throw new Error(`nothing pressable with the text "${text}"`);
  await act(async () => { (n.props['onPress'] as (e?: unknown) => void)({ preventDefault: () => undefined }); });
}
