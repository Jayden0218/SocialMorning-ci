/**
 * M11 US6 — how a show appears in the app, set by its owner (FR-024). NULL in a field means
 * "use what the feed says"; the feed stays the source of everything else.
 */
import type { Db } from '../../db.ts';

/** M14 US3: a contact has a type, so listeners see the right icon and the value is checked for it (FR-04). */
export const CONTACT_TYPES = ['website', 'email', 'wechat', 'wechat_official', 'weibo', 'jike', 'xiaohongshu'] as const;
export type Contact = { type: (typeof CONTACT_TYPES)[number]; value: string };

export type Overrides = {
  title: string | null; description: string | null; coverUrl: string | null; themeColour: string | null;
  milestoneMessage: string | null; hosts: string[] | null; links: { label: string; url: string }[] | null; updatedAt: string;
  contacts: Contact[] | null; tipsEnabled: boolean;
};

type Row = { title: string | null; description: string | null; cover_url: string | null; theme_colour: string | null; milestone_message: string | null; hosts: string[] | null; links: { label: string; url: string }[] | null; updated_at: Date | string; contacts: Contact[] | null; tips_enabled: boolean };

/**
 * Found by the M14 e2e on real PostgreSQL (2026-09-29), the same defect M5 found in `cache`: the
 * `postgres` driver stores a string parameter cast `$n::jsonb` as a JSON *string*; pglite does not,
 * so the unit tests were green. Writes now go through text; reads accept rows written before.
 */
const unwrap = <T>(v: T | string | null): T | null => (typeof v === 'string' ? (JSON.parse(v) as T) : v);

export async function getOverrides(db: Db, feedUrl: string): Promise<Overrides | null> {
  const [r] = await db.query<Row>(
    'SELECT title, description, cover_url, theme_colour, milestone_message, hosts, links, updated_at, contacts, tips_enabled FROM show_overrides WHERE feed_url = $1', [feedUrl]);
  if (!r) return null;
  return {
    title: r.title, description: r.description, coverUrl: r.cover_url, themeColour: r.theme_colour, milestoneMessage: r.milestone_message,
    hosts: unwrap(r.hosts), links: unwrap(r.links), updatedAt: new Date(r.updated_at).toISOString(), contacts: unwrap(r.contacts), tipsEnabled: r.tips_enabled,
  };
}

export type OverridesIn = {
  title?: string | null; description?: string | null; coverUrl?: string | null; themeColour?: string | null;
  milestoneMessage?: string | null; hosts?: string[] | null; links?: { label: string; url: string }[] | null;
  contacts?: Contact[] | null; tipsEnabled?: boolean;
};

/** Upsert the given fields; a field left out keeps its value, `null` clears it back to the feed's. */
export async function putOverrides(db: Db, feedUrl: string, by: string, o: OverridesIn): Promise<Overrides> {
  const cur = await getOverrides(db, feedUrl);
  const pick = <K extends keyof OverridesIn>(k: K, curV: unknown) => (k in o ? (o[k] ?? null) : curV ?? null);
  const next = {
    title: pick('title', cur?.title), description: pick('description', cur?.description), cover_url: pick('coverUrl', cur?.coverUrl),
    theme_colour: pick('themeColour', cur?.themeColour), milestone_message: pick('milestoneMessage', cur?.milestoneMessage),
    hosts: pick('hosts', cur?.hosts), links: pick('links', cur?.links), contacts: pick('contacts', cur?.contacts),
    tips_enabled: 'tipsEnabled' in o ? o.tipsEnabled === true : cur?.tipsEnabled ?? false,
  };
  await db.query(
    `INSERT INTO show_overrides (feed_url, title, description, cover_url, theme_colour, milestone_message, hosts, links, updated_at, updated_by, contacts, tips_enabled)
     VALUES ($1, $2, $3, $4, $5, $6, ($7::text)::jsonb, ($8::text)::jsonb, now(), $9, ($10::text)::jsonb, $11)
     ON CONFLICT (feed_url) DO UPDATE SET title = $2, description = $3, cover_url = $4, theme_colour = $5, milestone_message = $6,
       hosts = ($7::text)::jsonb, links = ($8::text)::jsonb, updated_at = now(), updated_by = $9, contacts = ($10::text)::jsonb, tips_enabled = $11`,
    [feedUrl, next.title, next.description, next.cover_url, next.theme_colour, next.milestone_message,
      next.hosts === null ? null : JSON.stringify(next.hosts), next.links === null ? null : JSON.stringify(next.links), by,
      next.contacts === null ? null : JSON.stringify(next.contacts), next.tips_enabled],
  );
  return (await getOverrides(db, feedUrl))!;
}
