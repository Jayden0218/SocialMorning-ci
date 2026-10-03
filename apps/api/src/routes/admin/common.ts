/**
 * Admin API — helpers more than one admin area uses (day and id parameters, shared body shapes, the catalogue reset).
 */
import { z } from 'zod';
import { ApiError } from '../../errors.ts';
import { dropCatalogMemo } from '../../catalog/live.ts';
import { dropDiscoverCache } from '../../db/repos/discover.ts';
import type { Db } from '../../db/db.ts';

export const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const validDay = (d: string | undefined): d is string => d !== undefined && DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

export const dayParam = (d: string | undefined): string => {
  if (!validDay(d)) throw new ApiError('validation', 'The day must be YYYY-MM-DD.', { fields: ['day'] });
  return d;
};

export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export const feedUrl = z.string().trim().url().max(2048).regex(/^https?:\/\//);

export const guid = z.string().trim().min(1).max(1024).optional();

export const version = z.number().int().min(0);

export const uuidParam = (v: string): string => {
  if (!/^[0-9a-f-]{36}$/i.test(v)) throw new ApiError('not_found', 'No such account.');
  return v;
};

/** After any picks/issues/collections save: the next Discover rebuilds from the tables (G-P1). */
export async function catalogChanged(db: Db): Promise<void> {
  dropCatalogMemo(db);
  await dropDiscoverCache(db);
}

export const target = z.string().trim().min(1).max(2048);
