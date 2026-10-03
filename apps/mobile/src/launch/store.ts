// Saves the promotion list, images and daily view counts in settings.
/**
 * M15 US3: the launch screen's local state, in the settings store (data-model.md —
 * "Phone-side state", no migration). Every read survives a missing or broken value by
 * returning "nothing", so a bad row can only ever mean "no launch screen".
 */
import type { SettingsStore } from '@/storage/types';
import type { Promotion, Shown } from './choose';

export const LAUNCH_KEYS = {
  /** The last `GET /v1/launch` answer. */
  list: 'launch.list',
  /** Ids whose image is in `Paths.cache/launch/`. */
  files: 'launch.files',
  /** `{ day, counts }` — impressions per promotion on the current local day. */
  shown: 'launch.shown',
} as const;

function parse(raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

const isPromotion = (v: unknown): v is Promotion => {
  const p = v as Promotion;
  return typeof p === 'object' && p !== null && typeof p.id === 'string' && typeof p.imageUrl === 'string'
    && (p.targetKind === 'route' || p.targetKind === 'url') && typeof p.target === 'string'
    && typeof p.label === 'string' && typeof p.startsAt === 'string' && typeof p.endsAt === 'string'
    && typeof p.weight === 'number' && typeof p.dailyCap === 'number';
};

export function readList(s: Pick<SettingsStore, 'get'>): Promotion[] {
  const v = parse(s.get(LAUNCH_KEYS.list));
  return Array.isArray(v) ? v.filter(isPromotion) : [];
}

export function writeList(s: SettingsStore, list: readonly Promotion[]): void {
  s.set(LAUNCH_KEYS.list, JSON.stringify(list.filter(isPromotion)));
}

export function readFiles(s: Pick<SettingsStore, 'get'>): Set<string> {
  const v = parse(s.get(LAUNCH_KEYS.files));
  return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
}

export function writeFiles(s: SettingsStore, ids: ReadonlySet<string>): void {
  s.set(LAUNCH_KEYS.files, JSON.stringify([...ids]));
}

export function readShown(s: Pick<SettingsStore, 'get'>): Shown | undefined {
  const v = parse(s.get(LAUNCH_KEYS.shown)) as Shown | undefined;
  if (typeof v !== 'object' || v === null || typeof v.day !== 'string' || typeof v.counts !== 'object' || v.counts === null) return undefined;
  return v;
}

export function writeShown(s: SettingsStore, shown: Shown): void {
  s.set(LAUNCH_KEYS.shown, JSON.stringify(shown));
}
