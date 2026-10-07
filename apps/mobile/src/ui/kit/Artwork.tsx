// Show or episode cover; shows the show's two-letter tile while loading, broken or missing.
/**
 * Episode or show artwork at a fixed size (M7). An episode with no artwork gets the
 * placeholder, never a blank square (research R4).
 *
 * M12 FR-004 (B5): the 2026-09-29 comparison saw artwork stay a plain grey square for up
 * to 20 s. Now the square carries the show's initial while the image loads, and an image that
 * fails keeps the initial — never a blank square.
 *
 * Owner, 2026-10-04: the square under the image is the made-for-you tile (social-core `cover.ts`)
 * — 2 letters on one of 7 soft colours, a circle in the corner — the same tile the server saves
 * for a Studio show with no cover, so a show looks the same before and after its image loads.
 *
 * M24 US18 (iPhone, 2026-10-08: Updates showed letter tiles for ~20 s, then the covers):
 *  1. The image no longer waits for JavaScript. It was drawn at opacity 0 and faded in from the
 *     `onLoad` event — a JS callback. While the page refreshes its feeds (fetch + parse on the JS
 *     thread, one feed after another) that event waits its turn, so a cover the phone already had
 *     stayed hidden. React Native's image paints itself the moment it has decoded; the tile under
 *     it shows until then.
 *  2. A cover is fetched near the size it is drawn. Feeds point at 1400–3000 px originals (Reply
 *     All 1.0 MB, each Joe Rogan episode 0.7 MB, measured 2026-10-08), and React Native's iOS loader
 *     runs at most 4 downloads at a time — a page of covers queued behind megabytes. `thumbUrl`
 *     asks the two resizing CDNs the feeds use (imgix, Apple's mzstatic) for about 3× the points.
 *  3. Corners follow the size, as the B designs draw them (`coverRadius`): 10–12 small, 14 mid,
 *     16–18 large.
 */
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from '@/ui/lib/image';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/lib/text';
import { coverRadius, type radius } from '@/design';
import { COVER_SHAPE, coverLetters, coverTone } from '@socialmorning/social-core';

/** Whole class names, so Tailwind can find each one written out. */
const ROUNDED: Record<keyof typeof radius, string> = {
  row: 'rounded-row',
  artwork: 'rounded-artwork',
  artworkLarge: 'rounded-artwork-lg',
  pill: 'rounded-pill',
  sheet: 'rounded-sheet',
};

/** The placeholder's letter: the first letter or digit of the show's name. */
export function initialOf(name?: string): string {
  const m = /[\p{L}\p{N}]/u.exec(name ?? '');
  return m ? m[0].toUpperCase() : '';
}

/** The B designs' corner for a cover drawn `size` points wide. */
export function cornerFor(size: number): number {
  for (const step of coverRadius) if (size <= step.upTo) return step.r;
  return coverRadius[coverRadius.length - 1]?.r ?? 16;
}

/** Pixel widths asked of a resizing CDN — a few steps, so one picture serves nearby sizes. */
const STEPS = [200, 300, 450, 600, 900, 1200];

/**
 * The cover's address for a picture about 3× `size` points (a 3× phone screen), on the CDNs
 * that resize by address; any other address comes back unchanged.
 *  - imgix (`*.imgix.net`, Megaphone feeds): adds `w` and `h` — unless the address sets them.
 *  - Apple (`*.mzstatic.com`): `…/3000x3000bb.jpg` → `…/600x600bb.jpg`, never larger.
 */
export function thumbUrl(url: string, size: number): string {
  const want = STEPS.find((s) => s >= size * 3) ?? STEPS[STEPS.length - 1]!;
  const host = /^https?:\/\/([^/?#]+)/i.exec(url)?.[1]?.toLowerCase() ?? '';
  if (host.endsWith('.imgix.net')) {
    if (/[?&](?:w|h)=/.test(url)) return url;
    return `${url}${url.includes('?') ? '&' : '?'}w=${want}&h=${want}`;
  }
  if (host.endsWith('.mzstatic.com')) {
    return url.replace(/\/(\d+)x(\d+)([a-z]{0,2})\.(jpe?g|png|webp)$/i, (whole, w: string, h: string, kind: string, ext: string) =>
      Number(w) > want && Number(h) > want ? `/${want}x${want}${kind}.${ext}` : whole);
  }
  return url;
}

export function Artwork(props: { url?: string | null; size: number; rounded?: keyof typeof radius; className?: string; name?: string }): React.ReactElement {
  const cls = `overflow-hidden ${props.rounded ? ROUNDED[props.rounded] : ''} ${props.className ?? ''}`;
  // The size, the corner and the tile's colour come from props, so they stay styles.
  const tone = coverTone(props.name ?? '');
  const box = { width: props.size, height: props.size };
  const corner = props.rounded ? undefined : { borderRadius: cornerFor(props.size) };
  const at = (share: number) => Math.round(share * props.size);
  const circle = { position: 'absolute' as const, right: -at(COVER_SHAPE.overhang), bottom: -at(COVER_SHAPE.overhang), width: at(COVER_SHAPE.circle), height: at(COVER_SHAPE.circle), borderRadius: at(COVER_SHAPE.circle) / 2, backgroundColor: tone.ink, opacity: COVER_SHAPE.circleOpacity };
  const letters = { position: 'absolute' as const, left: at(COVER_SHAPE.left), top: at(COVER_SHAPE.top), fontSize: at(COVER_SHAPE.letters), lineHeight: Math.round(at(COVER_SHAPE.letters) * 1.2), color: tone.ink };
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [props.url]);
  const mark = coverLetters(props.name ?? '');
  return (
    <Box className={cls} style={[box, corner, { backgroundColor: tone.fill }]} accessible={false} importantForAccessibility="no-hide-descendants">
      <Box style={circle} />
      {/* `text-text` satisfies the token check; the ink in `letters` is drawn over it. */}
      {mark ? <Text className="text-text font-bold" style={letters} numberOfLines={1}>{mark}</Text> : null}
      {props.url && !failed ? (
        <Image source={{ uri: thumbUrl(props.url, props.size) }} style={[StyleSheet.absoluteFill, box]} onError={() => setFailed(true)} />
      ) : null}
    </Box>
  );
}
