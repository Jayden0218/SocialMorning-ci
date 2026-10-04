// Draws the made-for-you show cover: a 1400 px PNG of two letters on a soft colour.
/**
 * Owner, 2026-10-04: a show made in the Studio with no cover gets this tile (rules and colours in
 * social-core `cover.ts`). Same renderer as the share card (satori → SVG, resvg → PNG). The PNG is
 * a full square with no rounded corners and no see-through pixels — apps round covers themselves,
 * and Apple Podcasts asks for a square 1400–3000 px JPEG or PNG.
 *
 * Letters are Manrope 800 (OFL-1.1, @fontsource/manrope — the Editorial sans). Chinese, Japanese
 * and Korean letters come from Google Fonts' Noto, subset to the 2 characters, the way the share
 * card does it; if that fetch fails the tile is still drawn, without its letters.
 */
import satori from 'satori';
import { Resvg } from '@resvg/resvg-wasm';
import { COVER_PX, COVER_SHAPE, type CoverTone } from '@socialmorning/social-core';
import { assets, bytes, familyFor, googleFont, type Font } from './card.ts';

let manrope: Promise<Font> | undefined;
function letterFont(): Promise<Font> {
  manrope ??= bytes(() => import('@fontsource/manrope/files/manrope-latin-800-normal.woff'), '@fontsource/manrope/files/manrope-latin-800-normal.woff')
    .then((u) => ({ name: 'Manrope', data: u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer, weight: 800, style: 'normal' }));
  manrope.catch(() => { manrope = undefined; });
  return manrope;
}

const px = (share: number) => Math.round(share * COVER_PX);

export function coverTree(tone: CoverTone, letters: string) {
  const circle = { position: 'absolute', right: -px(COVER_SHAPE.overhang), bottom: -px(COVER_SHAPE.overhang), width: px(COVER_SHAPE.circle), height: px(COVER_SHAPE.circle), borderRadius: '50%', backgroundColor: tone.ink, opacity: COVER_SHAPE.circleOpacity };
  const text = { position: 'absolute', left: px(COVER_SHAPE.left), top: px(COVER_SHAPE.top), fontFamily: 'Manrope', fontWeight: 800, fontSize: px(COVER_SHAPE.letters), lineHeight: 1.2, color: tone.ink, display: 'flex' };
  return {
    type: 'div',
    props: {
      style: { display: 'flex', position: 'relative', width: COVER_PX, height: COVER_PX, backgroundColor: tone.fill, overflow: 'hidden' },
      children: [{ type: 'div', props: { style: circle } }, ...(letters ? [{ type: 'div', props: { style: text, children: letters } }] : [])],
    },
  };
}

/** `whole` is false when a font for some letters could not be fetched — the route then caches it briefly, not for a year. */
export async function renderCover(tone: CoverTone, letters: string, fontFetch: typeof fetch): Promise<{ png: Uint8Array; whole: boolean }> {
  const [base, letter] = await Promise.all([assets(), letterFont()]);
  let whole = true;
  const svg = await satori(coverTree(tone, letters) as unknown as Parameters<typeof satori>[0], {
    width: COVER_PX, height: COVER_PX, fonts: [...base, letter],
    loadAdditionalAsset: async (code, segment) => {
      const family = familyFor(code, segment);
      if (family === undefined) { whole = false; return []; }
      const data = await googleFont(fontFetch, family, 700, segment);
      if (!data) whole = false;
      return data ? [{ name: family, data, weight: 700 as const, style: 'normal' as const }] : [];
    },
  });
  return { png: new Resvg(svg, { fitTo: { mode: 'width', value: COVER_PX } }).render().asPng(), whole };
}
