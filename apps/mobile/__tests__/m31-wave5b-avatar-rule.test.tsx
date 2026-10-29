// Wave 5b, ONE avatar colour rule: every letter avatar in the app takes its disc from the kit's palette function, picked from the name.
/**
 * Planner, contact/wave-5b (design-pulse2 `av(letter, colour)`: the colour per person in the drawings is sample data; the build has one rule).
 * The rule today lives inside the `Avatar` component (`AVATAR_TONES[coverToneIndex(name) % 5]`). This asks for it as a function,
 * `avatarTone(name)` exported by `@/ui/kit/Avatar` -> `{ fill, ink }`, and for every file that draws a person's letter to use it (or `<Avatar>`):
 *  - `avatarTone` exists, is deterministic, and equals what `Avatar` paints for the same name.
 *  - A source scan of src/ and app/: a file that draws a person's initial (`initialOf(`, `initialsOf(`, `.initials`) must import `avatarTone` or
 *    `Avatar` from the kit and must not pick a colour of its own (an indexed colour array, `hsl(`, `bg-glowGrey`, `bg-accentTint`).
 * Found with their own colour logic today (RED): src/ui/discover/RisingComments.tsx (colour by position `DISC[i % 3]`), src/ui/social/VoicePosts.tsx
 * (status rail initials on `bg-raise`), app/settings/blocked.tsx (`bg-glowGrey` disc), src/ui/kit/Avatar.tsx's `initials` branch (`bg-accentTint`).
 * Exempt on purpose: src/ui/auth/AuthShell.tsx `NameMonogram` (the drawing's typed-name monogram, raise-2 + hot-text; not a person's avatar) and
 * app/picks/past.tsx (a SHOW's letter). Break: give `RisingComments` back its `DISC[i % DISC.length]`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as AvatarModule from '@/ui/kit/Avatar';
import { Avatar, AVATAR_TONES } from '@/ui/kit/Avatar';
import { coverToneIndex } from '@socialmorning/social-core';

const ROOT = join(__dirname, '..');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? (f === 'node_modules' ? [] : walk(p)) : /\.tsx?$/.test(f) ? [p] : [];
});
const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))].filter((p) => !/\.test\.|__tests__/.test(p));
const rel = (p: string): string => relative(ROOT, p);
const EXEMPT = new Set(['src/ui/kit/Artwork.tsx', 'src/ui/auth/AuthShell.tsx', 'app/picks/past.tsx']);

describe('the palette function', () => {
  type ToneFn = (name: string | null | undefined) => { fill: string; ink: 'void' | 'text' };
  const tone = (AvatarModule as unknown as { avatarTone?: ToneFn }).avatarTone;
  it('is exported by the kit as avatarTone(name)', () => {
    expect(typeof tone).toBe('function');
  });
  it('picks the same tone as Avatar paints, the same every time, from the five palette tones', () => {
    for (const name of ['Mia', 'Rui Costa', 'Jayden', 'Ana', '', 'Zoë', '张三']) {
      const want = AVATAR_TONES[coverToneIndex(name) % AVATAR_TONES.length]!;
      expect(tone?.(name)).toEqual(want);
      expect(tone?.(name)).toEqual(tone?.(name));
      let r!: ReturnType<typeof create>;
      act(() => { r = create(createElement(Avatar, { name, size: 40 })); });
      const disc = r.root.findAll((n) => typeof n.type === 'string' && (StyleSheet.flatten(n.props['style'] as never) as Record<string, unknown> | undefined)?.['backgroundColor'] === want.fill);
      expect(disc.length).toBeGreaterThan(0);
      act(() => r.unmount());
    }
  });
  it('a missing name is handled (no throw)', () => {
    expect(() => tone?.(undefined)).not.toThrow();
    expect(tone?.(undefined)).toBeDefined();
  });
});

describe('every file that draws a person\'s letter uses that palette', () => {
  const drawers = files.filter((p) => /initialOf\(|initialsOf\(|\.initials\b|initials=/.test(readFileSync(p, 'utf8'))).map(rel).filter((p) => !EXEMPT.has(p));
  it('finds the avatar-drawing files (so the scan is not empty)', () => {
    expect(drawers).toEqual(expect.arrayContaining(['src/ui/kit/Avatar.tsx', 'src/ui/discover/RisingComments.tsx', 'src/ui/social/VoicePosts.tsx', 'app/settings/blocked.tsx']));
  });
  it.each([
    'src/ui/kit/Avatar.tsx', 'src/ui/discover/RisingComments.tsx', 'src/ui/social/VoicePosts.tsx', 'app/settings/blocked.tsx',
  ])('%s takes the disc from avatarTone (or hands the person to <Avatar>) and picks no colour of its own', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const own = file === 'src/ui/kit/Avatar.tsx';
    // Either the file imports avatarTone, or it no longer draws a letter itself (it hands the person to <Avatar>).
    const usesTone = /import\s*\{[^}]*\bavatarTone\b[^}]*\}\s*from\s*'@\/ui\/kit\/Avatar'/.test(src);
    const drawsLetterItself = /initialOf\(|initialsOf\(|\.initials\b/.test(src);
    expect(own || usesTone || !drawsLetterItself).toBe(true);
    expect(/hsl\(|hsla\(|rgba?\(/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''))).toBe(false);
    expect(/bg-glowGrey|bg-accentTint|\bDISC\[[^\]]*%/.test(src)).toBe(false);
  });
  it('no avatar-drawing file computes a colour (hsl/rgba/hex) in the same function that draws the letter', () => {
    for (const f of drawers) {
      const src = readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect({ f, own: /hsla?\(/.test(src) }).toEqual({ f, own: false });
    }
  });
});
