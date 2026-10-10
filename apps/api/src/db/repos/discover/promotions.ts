// Launch-screen promotions: store, schedule, count views and taps as totals only.
/**
 * M15 T020 — the owner's launch-screen promotions (constitution v2.4.0; FR-013–FR-017).
 *
 * Nothing here knows who saw a promotion: the table has no listener and no IP column, and an
 * event only adds 1 to a total (FR-017, guard G-L2). Images are counted against a 50 MB ceiling
 * over every promotion that is not retired and not over (G-L3).
 */
import type { Db } from '../../db.ts';
import { dual } from '../../backend.ts';

export type PromotionState = 'draft' | 'live' | 'ended' | 'retired';
export type Promotion = {
  id: string; imageUrl: string; imagePath: string; imageBytes: number; targetKind: 'route' | 'url'; target: string; label: string;
  startsAt: string; endsAt: string; weight: number; dailyCap: number; impressions: number; taps: number; state: PromotionState; createdAt: string;
};
export type PromotionInput = {
  imageUrl: string; imagePath: string; imageBytes: number; targetKind: 'route' | 'url'; target: string; label: string;
  startsAt: string; endsAt: string; weight: number; dailyCap: number;
};

type Row = {
  id: string; image_url: string; image_path: string; image_bytes: number; target_kind: 'route' | 'url'; target: string; label: string;
  starts_at: Date | string; ends_at: Date | string; weight: number; daily_cap: number; impressions: number | string; taps: number | string;
  retired_at: Date | string | null; created_at: Date | string;
};

// The column list is written out: a new column must be added here on purpose (G-L2 reads this table's columns).
const COLS = 'id, image_url, image_path, image_bytes, target_kind, target, label, starts_at, ends_at, weight, daily_cap, impressions, taps, retired_at, created_at';
const iso = (v: Date | string) => new Date(v).toISOString();

export function stateOf(r: { retired_at: unknown; starts_at: Date | string; ends_at: Date | string }, now = Date.now()): PromotionState {
  if (r.retired_at !== null && r.retired_at !== undefined) return 'retired';
  if (now < new Date(r.starts_at).getTime()) return 'draft';
  if (now >= new Date(r.ends_at).getTime()) return 'ended';
  return 'live';
}

const toPromotion = (r: Row): Promotion => ({
  id: r.id, imageUrl: r.image_url, imagePath: r.image_path, imageBytes: Number(r.image_bytes), targetKind: r.target_kind, target: r.target, label: r.label,
  startsAt: iso(r.starts_at), endsAt: iso(r.ends_at), weight: Number(r.weight), dailyCap: Number(r.daily_cap),
  impressions: Number(r.impressions), taps: Number(r.taps), state: stateOf(r), createdAt: iso(r.created_at),
});

async function listPromotionsPg(db: Db): Promise<Promotion[]> {
  return (await db.query<Row>(`SELECT ${COLS} FROM promotions ORDER BY created_at DESC`)).map(toPromotion);
}

async function getPromotionPg(db: Db, id: string): Promise<Promotion | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const [r] = await db.query<Row>(`SELECT ${COLS} FROM promotions WHERE id = $1`, [id]);
  return r ? toPromotion(r) : undefined;
}

/** Live = not retired and now in [starts_at, ends_at). The only ones the phone is told about. */
async function livePromotionsPg(db: Db): Promise<Promotion[]> {
  return (await db.query<Row>(`SELECT ${COLS} FROM promotions WHERE retired_at IS NULL AND starts_at <= now() AND ends_at > now() ORDER BY created_at`)).map(toPromotion);
}

/** Bytes held by promotions that still count: not retired and not over (drafts will go live). */
async function launchBytesPg(db: Db, exceptId?: string): Promise<number> {
  const [r] = await db.query<{ n: number | string }>(
    'SELECT coalesce(sum(image_bytes), 0)::bigint AS n FROM promotions WHERE retired_at IS NULL AND ends_at > now() AND ($1::uuid IS NULL OR id <> $1::uuid)', [exceptId ?? null]);
  return Number(r?.n ?? 0);
}

async function createPromotionPg(tx: Db, p: PromotionInput): Promise<Promotion> {
  const [r] = await tx.query<Row>(
    `INSERT INTO promotions (image_url, image_path, image_bytes, target_kind, target, label, starts_at, ends_at, weight, daily_cap)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${COLS}`,
    [p.imageUrl, p.imagePath, p.imageBytes, p.targetKind, p.target, p.label, p.startsAt, p.endsAt, p.weight, p.dailyCap],
  );
  return toPromotion(r!);
}

async function updatePromotionPg(tx: Db, id: string, p: Partial<PromotionInput> & { retired?: boolean }): Promise<Promotion | undefined> {
  const [r] = await tx.query<Row>(
    `UPDATE promotions SET
       image_url = coalesce($2, image_url), image_path = coalesce($3, image_path), image_bytes = coalesce($4, image_bytes),
       target_kind = coalesce($5, target_kind), target = coalesce($6, target), label = coalesce($7, label),
       starts_at = coalesce($8::timestamptz, starts_at), ends_at = coalesce($9::timestamptz, ends_at),
       weight = coalesce($10, weight), daily_cap = coalesce($11, daily_cap),
       retired_at = CASE WHEN $12::boolean IS TRUE THEN coalesce(retired_at, now()) WHEN $12::boolean IS FALSE THEN NULL ELSE retired_at END
     WHERE id = $1 RETURNING ${COLS}`,
    [id, p.imageUrl ?? null, p.imagePath ?? null, p.imageBytes ?? null, p.targetKind ?? null, p.target ?? null, p.label ?? null,
      p.startsAt ?? null, p.endsAt ?? null, p.weight ?? null, p.dailyCap ?? null, p.retired ?? null],
  );
  return r ? toPromotion(r) : undefined;
}

/** +1 to a total — nothing about who (FR-017). Only a live promotion counts. */
async function countEventPg(db: Db, id: string, kind: 'impression' | 'tap'): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const col = kind === 'tap' ? 'taps' : 'impressions';
  const rows = await db.query(`UPDATE promotions SET ${col} = ${col} + 1 WHERE id = $1 AND retired_at IS NULL AND starts_at <= now() AND ends_at > now() RETURNING id`, [id]);
  return rows.length > 0;
}

// M26 lane DV: each runs on Postgres, or on DynamoDB (ddb/promotions.ts) when the Db carries a Store (db/backend.ts).
export const listPromotions = dual('dv/promotions', 'listPromotions', listPromotionsPg);
export const getPromotion = dual('dv/promotions', 'getPromotion', getPromotionPg);
export const livePromotions = dual('dv/promotions', 'livePromotions', livePromotionsPg);
export const launchBytes = dual('dv/promotions', 'launchBytes', launchBytesPg);
export const createPromotion = dual('dv/promotions', 'createPromotion', createPromotionPg);
export const updatePromotion = dual('dv/promotions', 'updatePromotion', updatePromotionPg);
export const countEvent = dual('dv/promotions', 'countEvent', countEventPg);
