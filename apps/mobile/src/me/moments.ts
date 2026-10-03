// Keeps saved moments in episodes, each with an optional note.
/**
 * Saved moments with a note (the reference's PLUS feature "收藏时点，可记录时点笔记"),
 * free here — SocialNet takes no payments (constitution: everything free). A moment is an
 * episode and a time, plus an optional note; nothing is recorded or uploaded. On this
 * phone only, newest first.
 */
import type { SettingsStore } from '@/storage/types';
import { readList, writeList } from './local-list';
import { recordChange } from '@/sync/library';

export const MOMENTS_KEY = 'me.moments';
export const NOTE_MAX = 500;
export type Moment = { id: string; episodeId: string; atMs: number; note: string; savedAt: number };

const isMoment = (x: unknown): x is Moment => {
  const m = x as Moment;
  return typeof x === 'object' && x !== null && typeof m.id === 'string' && typeof m.episodeId === 'string' && typeof m.atMs === 'number' && typeof m.note === 'string' && typeof m.savedAt === 'number';
};

export const listMoments = (s: SettingsStore): Moment[] => readList(s, MOMENTS_KEY, isMoment);

export function saveMoment(s: SettingsStore, episodeId: string, atMs: number, note: string, now: number): Moment {
  const m: Moment = { id: `${episodeId}@${Math.max(0, Math.floor(atMs))}@${now}`, episodeId, atMs: Math.max(0, Math.floor(atMs)), note: note.trim().slice(0, NOTE_MAX), savedAt: now };
  writeList(s, MOMENTS_KEY, [m, ...listMoments(s)]);
  recordChange(s, 'moment', m.id, { episodeId: m.episodeId, atMs: m.atMs, note: m.note, savedAt: m.savedAt }, now);
  return m;
}

export function editMoment(s: SettingsStore, id: string, note: string, now = Date.now()): void {
  const next = listMoments(s).map((m) => (m.id === id ? { ...m, note: note.trim().slice(0, NOTE_MAX) } : m));
  writeList(s, MOMENTS_KEY, next);
  const m = next.find((x) => x.id === id);
  if (m) recordChange(s, 'moment', id, { episodeId: m.episodeId, atMs: m.atMs, note: m.note, savedAt: m.savedAt }, now);
}

export function deleteMoment(s: SettingsStore, id: string, now = Date.now()): void {
  writeList(s, MOMENTS_KEY, listMoments(s).filter((m) => m.id !== id));
  recordChange(s, 'moment', id, undefined, now);
}
