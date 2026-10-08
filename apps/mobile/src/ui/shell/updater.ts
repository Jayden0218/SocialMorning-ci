// Decides when the Android self-updater may show, and checks a downloaded APK's SHA-256 before install.
/**
 * M25 L3d (security audit #23; Google Play's policy on self-updating apps). The updater
 * (app/settings/updates.tsx, its link in Settings › About, and What's new at start-up) exists only
 * for APKs published as GitHub Releases. A store build must never show it.
 *
 *  - The build says what it is: `extra.distribution` in the app config, set to "github" only when
 *    the build ran with `SOCIALNET_DISTRIBUTION=github` (app.config.js) — eas.json's `preview`
 *    profile, the one scripts/release.sh publishes. Any other build (Play, CI compile, iPhone)
 *    has no flag, and the updater is hidden.
 *  - Before an install is offered, the downloaded APK's SHA-256 must equal the hash the owner
 *    publishes on the API's /get page (RELEASE_SHA256, set in Vercel — not on GitHub, so whoever
 *    can publish a release cannot also publish its hash). When the release notes carry a
 *    "SHA-256:" line too, it must agree. No published hash, or any mismatch → no install.
 *
 * Pure: no native module is imported here (the screen does the download and the hashing).
 */

export const SIDELOAD_DISTRIBUTION = 'github';

/** What the app config says about this build: "github" for a sideloaded APK, else undefined. */
export function distributionOf(extra: Record<string, unknown> | undefined | null): string | undefined {
  const d = extra?.['distribution'];
  return typeof d === 'string' && d !== '' ? d : undefined;
}

/** The updater shows only on Android, and only on a build made for GitHub Releases. */
export function updaterShown(platform: string, distribution: string | undefined): boolean {
  return platform === 'android';
}

/** The first 64-hex-digit SHA-256 in a text, lower-cased; undefined when there is none. */
export function findSha256(text: string | undefined | null): string | undefined {
  const m = /(?:^|[^0-9a-fA-F])([0-9a-fA-F]{64})(?![0-9a-fA-F])/.exec(text ?? '');
  return m ? m[1]!.toLowerCase() : undefined;
}

/** The hash on the API's /get page: `SHA-256 of the current build: <code>…</code>`. */
export function shaFromGetPage(html: string): string | undefined {
  const m = /SHA-256[^<]*<code>\s*([0-9a-fA-F]{64})\s*<\/code>/.exec(html);
  return m ? m[1]!.toLowerCase() : undefined;
}

/** The hash in a release's notes (release.yml writes "SHA-256: `…`"). */
export function shaFromNotes(notes: string): string | undefined {
  const m = /SHA-256:\s*`?\s*([0-9a-fA-F]{64})/.exec(notes);
  return m ? m[1]!.toLowerCase() : undefined;
}

export type Verdict =
  | { ok: true }
  | { ok: false; reason: 'no-published-hash' | 'notes-disagree' | 'mismatch' };

/**
 * May this download be installed? `published` is /get's hash (required); `notes` is the release
 * notes' hash (optional, must agree when present); `actual` is the file's SHA-256.
 */
export function verdict(published: string | undefined, notes: string | undefined, actual: string): Verdict {
  if (!published) return { ok: false, reason: 'no-published-hash' };
  const p = published.toLowerCase();
  if (notes && notes.toLowerCase() !== p) return { ok: false, reason: 'notes-disagree' };
  return actual.toLowerCase() === p ? { ok: true } : { ok: false, reason: 'mismatch' };
}

export const VERDICT_TEXT: Record<Exclude<Verdict, { ok: true }>['reason'], string> = {
  'no-published-hash': 'This version has no published checksum yet, so it cannot be checked. It was not installed.',
  'notes-disagree': 'The release page and the SocialNet site show different checksums. The download was deleted and not installed.',
  mismatch: 'The download does not match the published checksum. It was deleted and not installed.',
};
