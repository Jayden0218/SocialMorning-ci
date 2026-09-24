/**
 * FR-017/FR-018: the reference was *read*, not copied. The owner chose "copy
 * nothing" over "adapt with attribution", so this test is the mechanical half
 * of that promise — the other half is `LICENSES.md`, which says in words where
 * the look came from.
 *
 * What it can prove: none of the reference's own names, files or notices are
 * here. What it cannot prove: that a human did not retype a style block from
 * memory. That is what the "Taken as decisions / Deliberately changed" table
 * in LICENSES.md is for, and it is a claim, not evidence (Principle I).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const SEARCHED = ['app', 'src'];

/**
 * Identifiers and file names that exist only in the reference. Their presence
 * in our tree would mean a file came across rather than a decision.
 */
const REFERENCE_SYMBOLS = [
  'TracksList',
  'TrackListItem',
  'TracksListItem',
  'FloatingPlayer',
  'PlayerControls',
  'PlayerProgressBar',
  'PlayerVolumeBar',
  'PlayerRepeatToggle',
  'ArtistTracksList',
  'MovingText',
  'unknownTrackImageUri',
  'unknownArtistImageUri',
  'trackPlayerService',
  'useSetupTrackPlayer',
  'useTrackPlayerFavorite',
  'defaultStyles',
  'screenPadding',
];

/** Notices that would have ridden along with a copied file. */
const REFERENCE_NOTICES = [
  'CodeWithGionatha',
  'gionatha',
  'music-player',
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function everySource(): { path: string; text: string }[] {
  return SEARCHED.flatMap((dir) =>
    sourceFiles(join(ROOT, dir)).map((path) => ({
      path: path.slice(ROOT.length + 1),
      text: readFileSync(path, 'utf8'),
    })),
  );
}

it('no reference symbol or file name appears in app/ or src/', () => {
  const offenders: string[] = [];
  for (const { path, text } of everySource()) {
    for (const symbol of REFERENCE_SYMBOLS) {
      if (new RegExp(`\\b${symbol}\\b`).test(text)) offenders.push(`${path}: ${symbol}`);
    }
  }
  expect(offenders).toEqual([]);
});

it('no reference notice or repository name is embedded in the source', () => {
  // LICENSES.md names it deliberately; source files must not, because a name
  // in a source file is what a copied header looks like.
  const offenders: string[] = [];
  for (const { path, text } of everySource()) {
    for (const notice of REFERENCE_NOTICES) {
      if (text.toLowerCase().includes(notice.toLowerCase())) offenders.push(`${path}: ${notice}`);
    }
  }
  expect(offenders).toEqual([]);
});

it('LICENSES.md carries the provenance note the source files do not', () => {
  const licences = readFileSync(join(ROOT, 'LICENSES.md'), 'utf8');
  expect(licences).toContain('CodeWithGionatha-Labs/music-player');
  expect(licences).toContain('MIT');
  expect(licences).toMatch(/re-implemented/i);
  expect(licences).toMatch(/Nothing was copied/i);
});
