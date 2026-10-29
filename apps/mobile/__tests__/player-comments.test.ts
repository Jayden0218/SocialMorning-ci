// Tests that the player's comment button opens the comments page at the moment.
/**
 * M12 guard G-C1 (FR-020, found on the iPhone 2026-09-29): the player's comment button opened
 * the keyboard ("No moment attached" at 4:58) instead of the conversation. It now opens the
 * comments page with the current moment.
 *
 * The break that turns it red: point the button back at the composer (`commentHere`).
 *
 * Kept as a source check: the tray renders inside the player page's providers (social, queue sheet, player).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// M31 T024: the button is the tray's first item (src/ui/player/PlayerTray.tsx) and its handler is
// `useOpenComments` (src/ui/player/useClipAndComments.ts) — the page was split into parts (review D7).
const tray = readFileSync(join(__dirname, '../src/ui/player/PlayerTray.tsx'), 'utf8');
const nav = readFileSync(join(__dirname, '../src/ui/player/useClipAndComments.ts'), 'utf8');

it('the comment button opens the comments page, carrying the moment', () => {
  const button = /<Pressable onPress=\{(\w+)\}[^>]*accessibilityLabel=\{`Comments, /.exec(tray);
  expect(button).not.toBeNull();
  expect(button![1]).toBe('openComments');
  expect(tray).toMatch(/const openComments = useOpenComments\(/);
  const body = /export function useOpenComments[\s\S]*?\n}\n/.exec(nav)?.[0] ?? '';
  expect(body).toContain("pathname: '/comments/[episodeId]'");
  expect(body).toContain('at: String(');
  expect(body).not.toContain('composer.open');
});
