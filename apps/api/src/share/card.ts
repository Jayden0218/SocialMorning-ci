// Draws the 1080×1350 share card PNG with artwork, title and time.
/**
 * M12 FR-034 — the share card: a 1080×1350 PNG with the artwork, the title, the show and
 * "at mm:ss". No audio, ever.
 *
 * Renderer (research R9): satori 0.32.0 (MPL-2.0) lays out and turns text into SVG paths;
 * @resvg/resvg-wasm 2.6.2 (MPL-2.0) rasterises the SVG. Both are pure JS + WebAssembly, so
 * they run on Vercel's Node runtime and under node:test with no native build. satori 0.33
 * was NOT used: it added harfbuzzjs, which reads `hb.wasm` from disk next to its own file —
 * a path the one-file esbuild bundle does not have.
 *
 * Fonts: Inter 400/700 (OFL-1.1, @fontsource/inter) is bundled for Latin text. Any other
 * script (Chinese titles are the common case) is fetched on demand from Google Fonts' CSS2
 * API, subset to exactly the characters on the card (`text=`), the way @vercel/og does it.
 * If that fetch fails the card still renders; those characters are simply missing.
 */
import { readFile } from 'node:fs/promises';
import satori from 'satori';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

export type Font = { name: string; data: ArrayBuffer; weight: 400 | 700 | 800; style: 'normal' };

export const CARD_W = 1080;
export const CARD_H = 1350;

export async function bytes(load: () => Promise<{ default: Uint8Array }>, spec: string): Promise<Uint8Array> {
  try {
    const m = await load();
    if (m.default instanceof Uint8Array) return m.default;
  } catch { /* not bundled: read it from node_modules */ }
  // Not `createRequire`: the bundle's banner already declares that name at the top level.
  return new Uint8Array(await readFile(new URL(import.meta.resolve(spec))));
}

const toArrayBuffer = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

let ready: Promise<Font[]> | undefined;
/** The rasteriser, started once, and Inter. Shared with `cover.ts`: resvg can be initialised only once per process. */
export function assets(): Promise<Font[]> {
  ready ??= (async () => {
    const [wasm, regular, bold] = await Promise.all([
      bytes(() => import('@resvg/resvg-wasm/index_bg.wasm'), '@resvg/resvg-wasm/index_bg.wasm'),
      bytes(() => import('@fontsource/inter/files/inter-latin-400-normal.woff'), '@fontsource/inter/files/inter-latin-400-normal.woff'),
      bytes(() => import('@fontsource/inter/files/inter-latin-700-normal.woff'), '@fontsource/inter/files/inter-latin-700-normal.woff'),
    ]);
    await initWasm(wasm);
    return [
      { name: 'Inter', data: toArrayBuffer(regular), weight: 400, style: 'normal' },
      { name: 'Inter', data: toArrayBuffer(bold), weight: 700, style: 'normal' },
    ];
  })();
  ready.catch(() => { ready = undefined; });
  return ready;
}

const NOTO: Record<string, string> = {
  'zh-CN': 'Noto Sans SC', 'zh-TW': 'Noto Sans TC', 'zh-HK': 'Noto Sans HK', 'ja-JP': 'Noto Sans JP', 'ko-KR': 'Noto Sans KR',
  'th-TH': 'Noto Sans Thai', 'ar-AR': 'Noto Sans Arabic', 'he-IL': 'Noto Sans Hebrew', 'bn-IN': 'Noto Sans Bengali',
  'ta-IN': 'Noto Sans Tamil', 'te-IN': 'Noto Sans Telugu', 'ml-IN': 'Noto Sans Malayalam', 'devanagari': 'Noto Sans Devanagari',
  'kannada': 'Noto Sans Kannada', 'symbol': 'Noto Sans Symbols', 'math': 'Noto Sans Math', 'unknown': 'Noto Sans',
};

const OLD_SAFARI = 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1';

/**
 * The Noto family for what satori asks for. satori passes every language a segment could be,
 * joined with "|" — Han comes as "ja-JP|zh-CN|zh-TW|zh-HK" (found on a runner: a lookup of
 * the whole string matched nothing and the Chinese card drew "NO GLYPH" boxes). Han with kana
 * is Japanese; Han without kana is almost always Chinese, and the Japanese font lacks many
 * simplified forms, so it takes Simplified unless satori put a Traditional locale first.
 */
export function familyFor(code: string, segment: string): string | undefined {
  const codes = code.split('|');
  if (codes.some((c) => c === 'ja-JP' || c.startsWith('zh-'))) {
    if (/[\p{scx=Hira}\p{scx=Kana}]/u.test(segment)) return NOTO['ja-JP'];
    return NOTO[codes[0]!.startsWith('zh-') ? codes[0]! : 'zh-CN'];
  }
  return codes.map((c) => NOTO[c]).find((f) => f !== undefined);
}

/** One Google Fonts request for exactly `text`, in the weight asked for. Returns undefined on any failure. */
export async function googleFont(f: typeof fetch, family: string, weight: 400 | 700, text: string): Promise<ArrayBuffer | undefined> {
  try {
    const q = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weight}&text=${encodeURIComponent(text)}`;
    // Asked as an old Safari, Google answers `format('truetype')` (seen on a runner, run 36533543912);
    // satori reads TrueType but not WOFF2, which modern clients get. @vercel/og sends the same string.
    const css = await f(q, { signal: AbortSignal.timeout(3000), headers: { 'user-agent': OLD_SAFARI } });
    if (!css.ok) return undefined;
    const url = /src:\s*url\(([^)]+)\)\s*format\(['"](?:opentype|truetype)['"]\)/.exec(await css.text())?.[1];
    if (!url) return undefined;
    const font = await f(url, { signal: AbortSignal.timeout(3000) });
    return font.ok ? await font.arrayBuffer() : undefined;
  } catch {
    return undefined;
  }
}

export type CardInput = { title: string; show: string | null; atMs?: number; art?: { mime: 'image/png' | 'image/jpeg'; bytes: Uint8Array };
  /** M20 US1: lines chosen from the transcript, drawn as a quote above a smaller artwork. */
  quote?: string };

/** M20 US1 (FR-001): the most a quote card carries; the route refuses more. */
export const QUOTE_MAX = 280;

export const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
};

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export type El = { type: string; props: Record<string, unknown> & { style?: Record<string, unknown>; children?: unknown } };
export const div = (style: Record<string, unknown>, children?: unknown): El => ({ type: 'div', props: { style: { display: 'flex', ...style }, ...(children !== undefined ? { children } : {}) } });

export function cardTree(c: CardInput): El {
  if (c.quote) return quoteTree(c, c.quote);
  const art = c.art
    ? { type: 'img', props: { src: `data:${c.art.mime};base64,${Buffer.from(c.art.bytes).toString('base64')}`, width: 760, height: 760, style: { width: 760, height: 760, borderRadius: 36, objectFit: 'cover' } } }
    : div({ width: 760, height: 760, borderRadius: 36, backgroundColor: '#26262b', alignItems: 'center', justifyContent: 'center', color: '#8a8a93', fontSize: 64, fontWeight: 700 }, 'SocialNet');
  return div({ width: CARD_W, height: CARD_H, flexDirection: 'column', alignItems: 'center', backgroundColor: '#111114', color: '#f5f5f7', fontFamily: 'Inter', padding: '96px 80px 64px' }, [
    art,
    div({ flexDirection: 'column', width: '100%', marginTop: 56, flexGrow: 1 }, [
      div({ fontSize: 56, fontWeight: 700, lineHeight: 1.2 }, clip(c.title, 110)),
      ...(c.show ? [div({ fontSize: 38, color: '#b4b4bd', marginTop: 20 }, clip(c.show, 60))] : []),
    ]),
    div({ width: '100%', justifyContent: 'space-between', alignItems: 'center', fontSize: 34 }, [
      div({ fontWeight: 700, color: '#f5f5f7' }, 'SocialNet'),
      ...(c.atMs !== undefined ? [div({ backgroundColor: '#f5f5f7', color: '#111114', borderRadius: 40, padding: '10px 28px', fontWeight: 700 }, `at ${mmss(c.atMs)}`)] : []),
    ]),
  ]);
}

/**
 * M20 US1: the quote card — the selected transcript lines large, then a small artwork with the
 * episode and show, then the same footer as the moment card. Same size, same colours.
 */
function quoteTree(c: CardInput, quote: string): El {
  const text = clip(quote.replace(/\s+/g, ' ').trim(), QUOTE_MAX);
  const size = text.length > 180 ? 44 : text.length > 90 ? 52 : 62;
  const art = c.art
    ? { type: 'img', props: { src: `data:${c.art.mime};base64,${Buffer.from(c.art.bytes).toString('base64')}`, width: 200, height: 200, style: { width: 200, height: 200, borderRadius: 24, objectFit: 'cover' } } }
    : div({ width: 200, height: 200, borderRadius: 24, backgroundColor: '#26262b', alignItems: 'center', justifyContent: 'center', color: '#8a8a93', fontSize: 30, fontWeight: 700 }, 'SocialNet');
  return div({ width: CARD_W, height: CARD_H, flexDirection: 'column', backgroundColor: '#111114', color: '#f5f5f7', fontFamily: 'Inter', padding: '112px 80px 64px' }, [
    div({ fontSize: 160, fontWeight: 700, lineHeight: 0.8, color: '#8a8a93', height: 110 }, '“'),
    div({ fontSize: size, fontWeight: 700, lineHeight: 1.3, flexGrow: 1 }, text),
    div({ alignItems: 'center', marginTop: 48, marginBottom: 56 }, [
      art,
      div({ flexDirection: 'column', marginLeft: 36, flexShrink: 1 }, [
        div({ fontSize: 36, fontWeight: 700, lineHeight: 1.2 }, clip(c.title, 70)),
        ...(c.show ? [div({ fontSize: 30, color: '#b4b4bd', marginTop: 12 }, clip(c.show, 50))] : []),
      ]),
    ]),
    div({ width: '100%', justifyContent: 'space-between', alignItems: 'center', fontSize: 34 }, [
      div({ fontWeight: 700, color: '#f5f5f7' }, 'SocialNet'),
      ...(c.atMs !== undefined ? [div({ backgroundColor: '#f5f5f7', color: '#111114', borderRadius: 40, padding: '10px 28px', fontWeight: 700 }, `at ${mmss(c.atMs)}`)] : []),
    ]),
  ]);
}

/** SVG from satori, PNG from resvg. `fontFetch` is used only for scripts Inter does not cover. */
export async function renderCard(c: CardInput, fontFetch: typeof fetch): Promise<Uint8Array> {
  return renderTree(cardTree(c), fontFetch);
}

/** Any 1080×1350 card tree to PNG (M21 US9: the monthly recap card shares it). */
export async function renderTree(tree: El, fontFetch: typeof fetch): Promise<Uint8Array> {
  const fonts = await assets();
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width: CARD_W, height: CARD_H, fonts,
    loadAdditionalAsset: async (code, segment) => {
      const family = familyFor(code, segment);
      if (family === undefined) return [];
      const out: Font[] = [];
      for (const weight of [400, 700] as const) {
        const data = await googleFont(fontFetch, family, weight, segment);
        if (data) out.push({ name: family, data, weight, style: 'normal' });
      }
      return out;
    },
  });
  return new Resvg(svg, { fitTo: { mode: 'width', value: CARD_W } }).render().asPng();
}

/** The artwork's type from its first bytes — never from a header the publisher's CDN sets. */
export function imageKind(b: Uint8Array): 'image/png' | 'image/jpeg' | undefined {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  return undefined;
}
