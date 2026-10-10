// What the paid lane reads from lanes still on Postgres (hybrid only): hosted shows and show overrides (lane ST).
/**
 * M26 lane PD. Same SQL the Postgres bodies use, on the plain Postgres handle, and nowhere else. When lane ST moves
 * `hosted_shows` / `show_overrides`, it replaces these with its repo calls; CUT deletes this file.
 */
import type { Db } from '../../../db.ts';
import { pgOf } from '../../../backend-ddb.ts';

/** PD-03: a live hosted show's price level (undefined: no such live show). */
export async function hostedPriceTier(db: Db, feedUrl: string): Promise<{ price_tier: number | null } | undefined> {
  const [show] = await pgOf(db).query<{ price_tier: number | null }>('SELECT price_tier FROM hosted_shows WHERE feed_url = $1 AND deleted_at IS NULL', [feedUrl]);
  return show;
}

/** PD-04: whether the show takes tips. */
export async function tipsEnabled(db: Db, feedUrl: string): Promise<boolean> {
  const [o] = await pgOf(db).query<{ tips_enabled: boolean | null }>('SELECT tips_enabled FROM show_overrides WHERE feed_url = $1', [feedUrl]);
  return Boolean(o?.tips_enabled);
}

/** PD-24: the parts of a gift's show card that ST owns (override title; live hosted show's title and cover). */
export async function showCardParts(db: Db, feedUrl: string): Promise<{ overrideTitle: string | null; hostedTitle: string | null; hostedCover: string | null }> {
  const [r] = await pgOf(db).query<{ o_title: string | null; h_title: string | null; h_cover: string | null }>(
    `SELECT o.title AS o_title, h.title AS h_title, h.cover_url AS h_cover
       FROM (SELECT $1::text AS feed_url) x
       LEFT JOIN hosted_shows h ON h.feed_url = x.feed_url AND h.deleted_at IS NULL
       LEFT JOIN show_overrides o ON o.feed_url = x.feed_url`, [feedUrl]);
  return { overrideTitle: r?.o_title ?? null, hostedTitle: r?.h_title ?? null, hostedCover: r?.h_cover ?? null };
}
