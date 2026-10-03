// Reads and checks the daily picks file and returns picks for a day.
/**
 * M5 FR-004: the owner's picks file. Validation never throws — a bad entry is dropped
 * with a warning naming its index and reason, and the rest serve (principle IV; guard
 * G1). `picksForDay` gives today's picks, else the most recent past day's, at most 5.
 */
export type PickIn = { date: string; feedUrl: string; guid?: string; why: string; order?: number };

export const PICKS_PER_DAY = 5;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The file is either the M5 shape — an array of picks — or (M12) an object
 * `{ picks: [...], issues: [...] }`. Both read the same.
 */
export function validatePicks(file: unknown): { picks: PickIn[]; warnings: string[] } {
  const raw = isRecord(file) && !Array.isArray(file) ? file['picks'] : file;
  if (!Array.isArray(raw)) return { picks: [], warnings: ['picks: not an array'] };
  const picks: PickIn[] = [];
  const warnings: string[] = [];
  raw.forEach((entry, i) => {
    const reason = problemWith(entry);
    if (reason !== undefined) { warnings.push(`picks[${i}]: ${reason}`); return; }
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

/**
 * M12 FR-070 — past picks, a page of `perPage` days (newest first) strictly before `before`,
 * never after `today`. `next` is the date to pass as `before` for the following page, present
 * only when there is one. Each day is ordered the way `picksForDay` orders it.
 */
export function pastPickDays(picks: readonly PickIn[], today: string, before: string | undefined, perPage = 7): { days: { date: string; picks: PickIn[] }[]; next?: string } {
  const all = [...new Set(picks.map((p) => p.date))]
    .filter((d) => d <= today && (before === undefined || d < before))
    .sort()
    .reverse();
  const page = all.slice(0, perPage);
  const days = page.map((date) => ({ date, picks: picksForDay(picks, date).picks }));
  return all.length > perPage ? { days, next: page[perPage - 1]! } : { days };
}

/** M12 FR-101 — a curated issue: an editor's note over an ordered list of episodes. */
export type IssueItemIn = { order: number; feedUrl: string; guid?: string; note: string };
export type IssueIn = { id: string; date: string; title: string; intro: string; items: IssueItemIn[] };

const ISSUE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * The `issues` key of the picks file. Like the picks, never throws: a bad issue or a bad
 * item is dropped with a warning naming where it was, the rest serve. An array-shaped file
 * (the M5 shape) simply has no issues.
 */
export function validateIssues(file: unknown): { issues: IssueIn[]; warnings: string[] } {
  if (!isRecord(file) || Array.isArray(file) || file['issues'] === undefined) return { issues: [], warnings: [] };
  const raw = file['issues'];
  if (!Array.isArray(raw)) return { issues: [], warnings: ['issues: not an array'] };
  const issues: IssueIn[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, i) => {
    const reason = issueProblem(entry, seen);
    if (reason !== undefined) { warnings.push(`issues[${i}]: ${reason}`); return; }
    const e = entry as Record<string, unknown>;
    seen.add(e['id'] as string);
    const items: IssueItemIn[] = [];
    (e['items'] as unknown[]).forEach((it, j) => {
      const why = itemProblem(it);
      if (why !== undefined) { warnings.push(`issues[${i}].items[${j}]: ${why}`); return; }
      const x = it as Record<string, unknown>;
      items.push({
        order: x['order'] as number, feedUrl: x['feedUrl'] as string,
        ...(typeof x['guid'] === 'string' && x['guid'] !== '' ? { guid: x['guid'] } : {}),
        note: (x['note'] as string).trim(),
      });
    });
    items.sort((a, b) => a.order - b.order);
    issues.push({ id: e['id'] as string, date: e['date'] as string, title: (e['title'] as string).trim(), intro: (e['intro'] as string).trim(), items });
  });
  return { issues, warnings };
}

function issueProblem(entry: unknown, seen: ReadonlySet<string>): string | undefined {
  if (!isRecord(entry)) return 'not an object';
  if (typeof entry['id'] !== 'string' || !ISSUE_ID.test(entry['id'])) return 'id must be 1–64 lower-case letters, digits or dashes';
  if (seen.has(entry['id'])) return 'id is used twice';
  if (typeof entry['date'] !== 'string' || !DATE.test(entry['date'])) return 'date must be YYYY-MM-DD';
  if (!text(entry['title'], 80)) return 'title must be 1–80 characters';
  if (!text(entry['intro'], 600)) return 'intro must be 1–600 characters';
  if (!Array.isArray(entry['items'])) return 'items must be an array';
  return undefined;
}

function itemProblem(it: unknown): string | undefined {
  if (!isRecord(it)) return 'not an object';
  if (typeof it['order'] !== 'number' || !Number.isInteger(it['order'])) return 'order must be an integer';
  if (typeof it['feedUrl'] !== 'string' || !/^https?:\/\//.test(it['feedUrl'])) return 'feedUrl must be an http(s) URL';
  if (!text(it['note'], 280)) return 'note must be 1–280 characters';
  return undefined;
}

const text = (v: unknown, max: number): boolean => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= max;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
