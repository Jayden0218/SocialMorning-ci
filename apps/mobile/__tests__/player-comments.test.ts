// Tests that the player's comment button opens the comments page at the moment.
/**
 * M12 guard G-C1 (FR-020, found on the iPhone 2026-09-29): the player's comment button opened
 * the keyboard ("No moment attached" at 4:58) instead of the conversation. It now opens the
 * comments page with the current moment.
 *
 * The break that turns it red: point the button back at the composer (`commentHere`).
 *
 * Kept as a source check: the button and its handler live only in app/player.tsx, a page of ~55
 * imports (poll, live count, discover, transcripts, audio rows, quote video…) with no smaller
 * component carrying them; rendering it would mean mocking every one.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const player = readFileSync(join(__dirname, '../app/player.tsx'), 'utf8');

it('the comment button opens the comments page, carrying the moment', () => {
  const button = /<Pressable onPress=\{(\w+)\}[^>]*accessibilityLabel=\{`Comments, /.exec(player);
  expect(button).not.toBeNull();
  const handler = button![1]!;
  const body = new RegExp(`const ${handler} = \\(\\) =>\\s*([\\s\\S]*?);\\n`).exec(player)?.[1] ?? '';
  expect(body).toContain("pathname: '/comments/[episodeId]'");
  expect(body).toContain('at: String(');
  expect(body).not.toContain('composer.open');
});
