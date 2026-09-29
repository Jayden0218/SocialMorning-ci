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
