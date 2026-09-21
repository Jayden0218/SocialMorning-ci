/**
 * `<itunes:duration>` is the single least trustworthy field in podcast RSS.
 * Observed in the wild: plain seconds, `H:MM:SS`, `MM:SS`, fractional
 * seconds, empty, and outright prose. It also LIES — a publisher's stated
 * duration and the actual media length routinely disagree — so treat this as
 * a display hint and take the real duration from the player once loaded.
 */
export function parseDurationMs(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const text = String(raw).trim();
  if (text === '') return undefined;

  if (text.includes(':')) {
    const parts = text.split(':');
    // `SS` alone is ambiguous with seconds and never written with a colon;
    // beyond `H:MM:SS` there is no agreed meaning. Refuse both.
    if (parts.length < 2 || parts.length > 3) return undefined;
    let total = 0;
    for (const part of parts) {
      // `1::03` must not quietly become 3603: an empty field is malformed,
      // and Number('') is 0, which would accept it.
      if (part.trim() === '') return undefined;
      const value = Number(part);
      if (!Number.isFinite(value) || value < 0) return undefined;
      // Deliberately NOT bounded to 0-59. `0:75:00` appears in real feeds and
      // means 75 minutes; rejecting it loses a duration that is recoverable.
      total = total * 60 + value;
    }
    return Math.round(total * 1000);
  }

  const seconds = Number(text);
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return Math.round(seconds * 1000);
}

/**
 * `<pubDate>` is specified as RFC-822 and is frequently ISO-8601 instead.
 * `Date.parse` accepts both. An unparsable date is a warning, never a
 * failure — an episode with no date still plays.
 */
export function parseDateMs(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const text = String(raw).trim();
  if (text === '') return undefined;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? undefined : parsed;
}
