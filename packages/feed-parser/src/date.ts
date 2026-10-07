// Reads RFC-822 and ISO-8601 feed dates the same way on the phone and the server.
/**
 * M23 US5 (FR-009): one date reader instead of `Date.parse`.
 *
 * `Date.parse` was the bug: it reads a date-time with no zone as LOCAL time (so the phone in
 * Kuala Lumpur and the server in UTC disagreed by 8 hours), and Hermes and V8 accept
 * different odd shapes. This reader is plain arithmetic over `Date.UTC`, so both runtimes
 * give the same number for the same text.
 *
 * Rules:
 * - A missing zone is UTC.
 * - Named zones use the RFC-822 table (`CST` is US Central, -06:00, as RFC-822 defines it —
 *   not China Standard Time; a Chinese feed that means +08:00 should write `+0800`).
 * - Anything else is `undefined` (an `unparsable-date` warning), never a guess.
 */

/** RFC-822 §5.1 named zones plus the common UTC spellings, in minutes east of UTC. */
export const NAMED_ZONES: Readonly<Record<string, number>> = {
  UT: 0, UTC: 0, GMT: 0, Z: 0,
  EST: -300, EDT: -240,
  CST: -360, CDT: -300,
  MST: -420, MDT: -360,
  PST: -480, PDT: -420,
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// [Day,] D Mon YYYY [HH:MM[:SS]] [zone]   — zone: +hhmm, -hh:mm, a name, or GMT+8 style.
// The year tries four digits first and is followed by a word boundary, so `2024` is never read
// as `20` with `24 …` left over as the zone (the first gate run caught exactly that).
const RFC822 = /^(?:[a-z]+,?\s+)?(\d{1,2})\s+([a-z]+)\.?\s+(\d{4}|\d{2})\b(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\s+(.*))?$/i;
// YYYY-MM-DD[(T| )HH:MM[:SS[.fff]]][Z|±hh[:mm]]
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** Minutes east of UTC for a zone text; 0 for none; undefined for one we cannot read. */
function zoneMinutes(raw: string | undefined): number | undefined {
  const z = (raw ?? '').trim();
  if (z === '') return 0;
  const named = NAMED_ZONES[z.toUpperCase()];
  if (named !== undefined) return named;
  // +0800, -05:00, +08, and the GMT+8 / UTC+08:00 spellings some feeds write.
  const m = /^(?:GMT|UTC)?\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i.exec(z);
  if (!m) return undefined;
  const hours = Number(m[2]);
  const mins = m[3] === undefined ? 0 : Number(m[3]);
  if (hours > 14 || mins > 59) return undefined;
  return (m[1] === '-' ? -1 : 1) * (hours * 60 + mins);
}

function utc(y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number, zone: number): number | undefined {
  if (mo < 0 || mo > 11 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) return undefined;
  const t = Date.UTC(y, mo, d, h, mi, Math.min(s, 59), ms) - zone * 60_000;
  // 31 Feb rolls into March in Date.UTC; refuse it rather than move the episode.
  if (new Date(Date.UTC(y, mo, d)).getUTCDate() !== d) return undefined;
  return Number.isFinite(t) ? t : undefined;
}

/** Epoch milliseconds for an RFC-822 or ISO-8601 date, or undefined. */
export function parseFeedDate(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  // A trailing RFC-822 comment such as `+0000 (UTC)` says nothing the offset did not.
  const text = String(raw).trim().replace(/\s+/g, ' ').replace(/\s*\([^)]*\)$/, '');
  if (text === '') return undefined;

  const iso = ISO.exec(text);
  if (iso) {
    const zone = zoneMinutes(iso[8]);
    if (zone === undefined) return undefined;
    const frac = iso[7] === undefined ? 0 : Number(iso[7].slice(0, 3).padEnd(3, '0'));
    return utc(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] ?? 0), Number(iso[5] ?? 0), Number(iso[6] ?? 0), frac, zone);
  }

  const rfc = RFC822.exec(text);
  if (rfc) {
    const month = MONTHS.indexOf(rfc[2]!.slice(0, 3).toLowerCase());
    if (month === -1) return undefined;
    const zone = zoneMinutes(rfc[7]);
    if (zone === undefined) return undefined;
    let year = Number(rfc[3]);
    // RFC-822 allowed two-digit years; RFC-2822 §4.3 reads 00–49 as 20xx and 50–99 as 19xx.
    if (rfc[3]!.length === 2) year += year < 50 ? 2000 : 1900;
    return utc(year, month, Number(rfc[1]), Number(rfc[4] ?? 0), Number(rfc[5] ?? 0), Number(rfc[6] ?? 0), 0, zone);
  }
  return undefined;
}
