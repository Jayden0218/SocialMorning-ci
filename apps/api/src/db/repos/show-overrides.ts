/**
 * M11 US6 — how a show appears in the app, set by its owner (FR-024). NULL in a field means
 * "use what the feed says"; the feed stays the source of everything else.
 */
import type { Db } from '../db.ts';

export type Overrides = {
  title: string | null; description: string | null; coverUrl: string | null; themeColour: string | null;
  milestoneMessage: string | null; hosts: string[] | null; links: { label: string; url: string }[] | null; updatedAt: string;
};

type Row = { title: string | null; description: string | null; cover_url: string | null; theme_colour: string | null; milestone_message: string | null; hosts: string[] | null; links: { label: string; url: string }[] | null; updated_at: Date | string };

export async function getOverrides(db: Db, feedUrl: string): Promise<Overrides | null> {
  const [r] = await db.query<Row>(
    'SELECT title, description, cover_url, theme_colour, milestone_message, hosts, links, updated_at FROM show_overrides WHERE feed_url = $1', [feedUrl]);
  if (!r) return null;
  return {
    title: r.title, description: r.description, coverUrl: r.cover_url, themeColour: r.theme_colour, milestoneMessage: r.milestone_message,
    hosts: r.hosts, links: r.links, updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export type OverridesIn = {
  title?: string | null; description?: string | null; coverUrl?: string | null; themeColour?: string | null;
  milestoneMessage?: string | null; hosts?: string[] | null; links?: { label: string; url: string }[] | null;
};

/** Upsert the given fields; a field left out keeps its value, `null` clears it back to the feed's. */
export async function putOverrides(db: Db, feedUrl: string, by: string, o: OverridesIn): Promise<Overrides> {
  const cur = await getOverrides(db, feedUrl);
  const pick = <K extends keyof OverridesIn>(k: K, curV: unknown) => (k in o ? (o[k] ?? null) : curV ?? null);
  const next = {
    title: pick('title', cur?.title), description: pick('description', cur?.description), cover_url: pick('coverUrl', cur?.coverUrl),
    theme_colour: pick('themeColour', cur?.themeColour), milestone_message: pick('milestoneMessage', cur?.milestoneMessage),
    hosts: pick('hosts', cur?.hosts), links: pick('links', cur?.links),
  };
  await db.query(
    `INSERT INTO show_overrides (feed_url, title, description, cover_url, theme_colour, milestone_message, hosts, links, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, now(), $9)
     ON CONFLICT (feed_url) DO UPDATE SET title = $2, description = $3, cover_url = $4, theme_colour = $5, milestone_message = $6,
       hosts = $7::jsonb, links = $8::jsonb, updated_at = now(), updated_by = $9`,
    [feedUrl, next.title, next.description, next.cover_url, next.theme_colour, next.milestone_message,
      next.hosts === null ? null : JSON.stringify(next.hosts), next.links === null ? null : JSON.stringify(next.links), by],
  );
  return (await getOverrides(db, feedUrl))!;
}
