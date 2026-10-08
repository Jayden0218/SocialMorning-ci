// The open-source packages the app ships and their licences, read from the generated licences.json.
/**
 * M25 L2: `licences.json` is written by scripts/licences.mjs from package-lock.json and the
 * installed packages' LICENSE files — edit the script, not the JSON. Shown on
 * Settings › About › Open-source licences (app/settings/licences.tsx).
 */
import data from './licences.json';

export type Licence = { name: string; version: string; licence: string; url?: string; text?: number };

const DATA = data as { generated: string; packages: Licence[]; texts: string[] };

export const LICENCES: readonly Licence[] = DATA.packages;
export const LICENCES_GENERATED: string = DATA.generated;

/** The package's own licence text, or undefined when the list has none for it. */
export function licenceText(entry: Licence): string | undefined {
  return entry.text === undefined ? undefined : DATA.texts[entry.text];
}
