// The made-for-you cover: two letters from the show's name on one of seven soft colours.
/**
 * Owner, 2026-10-04: a show made in the Studio with no cover gets a tile instead — the `SignIn-B`
 * tile from the Editorial canvas: a soft fill, the letters in a dark ink of the same hue at the
 * top left, and a circle of that ink at 18 % in the bottom-right corner. The server draws it as a
 * PNG and saves its address as the show's cover; the phone draws the same tile for any show that
 * has no artwork. One rule here so both pick the same letters and the same colour.
 *
 * Letters: 2. A Chinese, Japanese or Korean name takes its first 2 characters ("晚间漫谈" → "晚间");
 * any other name takes the first letter of its first 2 words ("Late Walks" → "LW"), or the first
 * 2 letters of a one-word name ("Serial" → "SE").
 */
import { fnv1a64 } from './hash';

/**
 * Fill and ink. The first 4 are `SignIn-B`'s own; the other 3 take fills the Editorial designs
 * already use (lavender, teal) and a butter yellow, each with a darker ink of the same hue.
 * Every pair is ≥ 3:1 (WCAG large text), measured in cover.test.ts.
 */
export const COVER_TONES = [
  { fill: '#e8d5b0', ink: '#8a5a00' },
  { fill: '#c9d8c5', ink: '#3f5a3a' },
  { fill: '#c7d3e3', ink: '#34496a' },
  { fill: '#e3c9c9', ink: '#7a3b3b' },
  { fill: '#d9cfe6', ink: '#54427a' },
  { fill: '#cfdde0', ink: '#2c5a62' },
  { fill: '#f2e6b8', ink: '#6b5512' },
] as const;

export type CoverTone = (typeof COVER_TONES)[number];

/** `SignIn-B`'s 196 pt tile as shares of the side: corner circle, its overhang, the letters' place and size. */
export const COVER_SHAPE = { circle: 108 / 196, overhang: 39 / 196, left: 21 / 196, top: 19 / 196, letters: 51 / 196, circleOpacity: 0.18 } as const;

/** The side of the drawn PNG: Apple Podcasts' smallest allowed cover (1400–3000 px). */
export const COVER_PX = 1400;

const CJK = /[\p{scx=Han}\p{scx=Hira}\p{scx=Kana}\p{scx=Hang}]/u;
const WORD = /[\p{L}\p{N}]+/gu;

/** The tile's letters for a show name; '' when the name has no letter or digit at all. */
export function coverLetters(name: string): string {
  const words = name.match(WORD) ?? [];
  const first = words[0];
  if (first === undefined) return '';
  if (CJK.test(first[0]!)) return [...words.join('')].slice(0, 2).join('');
  const second = words[1];
  const pick = second === undefined ? [...first].slice(0, 2) : [[...first][0]!, [...second][0]!];
  return pick.join('').toUpperCase();
}

/** Which of the 7 colours a name gets: the same name, the same colour, everywhere. */
export function coverToneIndex(name: string): number {
  return parseInt(fnv1a64(name.trim().toLowerCase()).slice(-8), 16) % COVER_TONES.length;
}

export function coverTone(name: string): CoverTone {
  return COVER_TONES[coverToneIndex(name)]!;
}

/** The path segment that names one tile. `v1` changes if the drawing ever does, so caches never serve an old one. */
const PREFIX = '/covers/auto/v1/';

/** The drawn cover's address: `<base>/covers/auto/v1/<colour>[-<hex code point>…].png`, plain ASCII. */
export function autoCoverUrl(base: string, name: string): string {
  const points = [...coverLetters(name)].map((ch) => `-${ch.codePointAt(0)!.toString(16)}`).join('');
  return `${base.replace(/\/+$/, '')}${PREFIX}${coverToneIndex(name)}${points}.png`;
}

/** True for an address made by `autoCoverUrl` — a drawn cover, not one the owner uploaded. */
export function isAutoCover(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.includes(PREFIX);
}

/**
 * The tile a file name asks for (`3-4c-57.png` → colour 3, "LW"), or undefined for anything
 * `autoCoverUrl` could not have made: an unknown colour, more than 2 letters, or a code point
 * that is not a letter or digit.
 */
export function parseAutoCover(file: string): { tone: CoverTone; letters: string } | undefined {
  const m = /^(\d)((?:-[0-9a-f]{1,6}){0,2})\.png$/.exec(file);
  if (!m) return undefined;
  const tone = COVER_TONES[Number(m[1])];
  if (tone === undefined) return undefined;
  const points = m[2]!.split('-').slice(1).map((h) => parseInt(h, 16));
  if (points.some((p) => p > 0x10ffff)) return undefined;
  const letters = String.fromCodePoint(...points);
  if (!/^[\p{L}\p{N}]*$/u.test(letters)) return undefined;
  return { tone, letters };
}
