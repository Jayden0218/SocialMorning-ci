/**
 * M5 FR-004: the owner's picks file. Validation never throws — a bad entry is dropped
 * with a warning naming its index and reason, and the rest serve (principle IV; guard
 * G1). `picksForDay` gives today's picks, else the most recent past day's, at most 5.
 */
export type PickIn = { date: string; feedUrl: string; guid?: string; why: string; order?: number };

export const PICKS_PER_DAY = 5;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validatePicks(raw: unknown): { picks: PickIn[]; warnings: string[] } {
  if (!Array.isArray(raw)) return { picks: [], warnings: ['picks: not an array'] };
  const picks: PickIn[] = [];
  const warnings: string[] = [];
  raw.forEach((entry, i) => {
    const reason = problemWith(entry);
    if (reason !== undefined) throw new Error(`picks[${i}]: ${reason}`);
    const e = entry as Record<string, unknown>;
    picks.push({
      date: e['date'] as string,
      feedUrl: e['feedUrl'] as string,
      ...(typeof e['guid'] === 'string' && e['guid'] !== '' ? { guid: e['guid'] } : {}),
      why: (e['why'] as string).trim(),
      ...(typeof e['order'] === 'number' ? { order: e['order'] } : {}),
    });
  });
  return { picks, warnings };
}

function problemWith(entry: unknown): string | undefined {
  if (typeof entry !== 'object' || entry === null) return 'not an object';
  const e = entry as Record<string, unknown>;
  if (typeof e['date'] !== 'string' || !DATE.test(e['date'])) return 'date must be YYYY-MM-DD';
  if (typeof e['feedUrl'] !== 'string' || !/^https?:\/\//.test(e['feedUrl'])) return 'feedUrl must be an http(s) URL';
  if (typeof e['why'] !== 'string' || e['why'].trim().length < 1 || e['why'].trim().length > 140) return 'why must be 1–140 characters';
  if (e['order'] !== undefined && (typeof e['order'] !== 'number' || !Number.isInteger(e['order']))) return 'order must be an integer';
  return undefined;
}

export function picksForDay(picks: readonly PickIn[], today: string): { date?: string; picks: PickIn[] } {
  const days = [...new Set(picks.map((p) => p.date))].filter((d) => d <= today).sort();
  const date = days[days.length - 1];
  if (date === undefined) return { picks: [] };
  const ofDay = picks
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.date === date)
    .sort((a, b) => (a.p.order ?? Number.MAX_SAFE_INTEGER) - (b.p.order ?? Number.MAX_SAFE_INTEGER) || a.i - b.i)
    .slice(0, PICKS_PER_DAY)
    .map((x) => x.p);
  return { date, picks: ofDay };
}
