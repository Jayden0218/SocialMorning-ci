// Draws the monthly recap share card: the month, hours listened, top 3 shows and the app link.
/**
 * M21 US9 (spec scenario 3): the recap as a 1080×1350 PNG, drawn by the same renderer as the
 * moment and quote cards (`card.ts`: satori + resvg). The phone sends the numbers it already
 * shows on its month page, so the card carries nothing the listener did not see; no listener is
 * named. In the Editorial colours: a paper page, a yellow block with the hours.
 */
import { CARD_H, CARD_W, clip, div, renderTree, type El } from './card.ts';

export type RecapInput = { month: string; minutes: number; shows: string[]; link: string };

/** At most this many top shows, each at most this long; the route refuses more. */
export const RECAP_SHOWS = 3;
export const RECAP_SHOW_MAX = 120;
/** A month has at most 31 × 24 × 60 minutes. */
export const RECAP_MINUTES_MAX = 44_640;

const PAPER = '#fbf8f1';
const INK = '#16130d';
const MUTED = '#5c5546';
const YELLOW = '#fcc522';
const ON_YELLOW = '#111114';

/** "September 2026" from "2026-09" (English month names, as the phone's page shows them). */
export function monthTitle(month: string): string {
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  const i = m ? Number(m[2]) - 1 : -1;
  return m && i >= 0 && i < 12 ? `${names[i]} ${m[1]}` : month;
}

/** "12 h 5 min", or "45 min" under an hour. */
export function hoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function recapTree(r: RecapInput): El {
  const shows = r.shows.slice(0, RECAP_SHOWS);
  return div({ width: CARD_W, height: CARD_H, flexDirection: 'column', backgroundColor: PAPER, color: INK, fontFamily: 'Inter', padding: '96px 80px 64px' }, [
    div({ fontSize: 34, color: MUTED, fontWeight: 700, letterSpacing: 4 }, 'MY MONTH IN LISTENING'),
    div({ fontSize: 76, fontWeight: 700, marginTop: 16, lineHeight: 1.1 }, monthTitle(r.month)),
    div({ flexDirection: 'column', backgroundColor: YELLOW, color: ON_YELLOW, borderRadius: 36, padding: '48px 56px', marginTop: 56 }, [
      div({ fontSize: 30, fontWeight: 700, letterSpacing: 4 }, 'LISTENING TIME'),
      div({ fontSize: 120, fontWeight: 700, marginTop: 8, lineHeight: 1.1 }, hoursMinutes(r.minutes)),
    ]),
    div({ flexDirection: 'column', marginTop: 56, flexGrow: 1 }, shows.length > 0
      ? [
          div({ fontSize: 34, fontWeight: 700, color: MUTED, marginBottom: 12 }, 'Top shows'),
          ...shows.map((s, i) => div({ alignItems: 'center', marginTop: 20 }, [
            div({ width: 64, fontSize: 48, fontWeight: 700, color: MUTED }, String(i + 1)),
            div({ fontSize: 46, fontWeight: 700, lineHeight: 1.2, flexShrink: 1 }, clip(s, 60)),
          ])),
        ]
      : [div({ fontSize: 40, color: MUTED }, 'Every minute counted.')]),
    div({ width: '100%', justifyContent: 'space-between', alignItems: 'center', fontSize: 32 }, [
      div({ fontWeight: 700, color: INK }, 'SocialNet'),
      div({ color: MUTED }, r.link),
    ]),
  ]);
}

export async function renderRecap(r: RecapInput, fontFetch: typeof fetch): Promise<Uint8Array> {
  return renderTree(recapTree(r), fontFetch);
}
