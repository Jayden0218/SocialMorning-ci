/**
 * The pure parts of the expo-file-system adapter. What this proves: where a transfer
 * continues from (gap 1 / D0 on build 3: a kill or a network loss must resume from the
 * partial file's size on Android). What it does not: that the native Range resume works
 * on the phone — D0.
 */
jest.mock('expo-file-system', () => ({
  Directory: class {}, DownloadTask: class {}, File: class {}, Paths: { document: '/doc' },
}));
import { extensionFor, resumeStateFor } from '../src/downloads/expo-downloader';
import type { DownloadRow } from '../src/downloads/types';

const row = (extra: Partial<DownloadRow> = {}): DownloadRow => ({
  episodeId: 'e', filePath: 'file:///doc/downloads/e.mp3', state: 'paused', bytesDone: 0, allowMobile: false, requestedAt: 1, ...extra,
});
const URL = 'https://cdn.example.com/e.mp3';
const partial = { exists: true, size: 12_345, uri: 'file:///doc/downloads/e.mp3' };

it('a saved pause state wins over everything', () => {
  const saved = { url: URL, fileUri: partial.uri, isDirectory: false, resumeData: '999' };
  expect(resumeStateFor(row({ resumeData: JSON.stringify(saved) }), URL, partial, 'android')).toEqual(saved);
});

it('Android, no saved state, partial file on disk → the offset is the file size', () => {
  expect(resumeStateFor(row(), URL, partial, 'android')).toEqual({ url: URL, fileUri: partial.uri, isDirectory: false, resumeData: '12345' });
});

it('nothing on disk, or an empty file, or iOS → a fresh download', () => {
  expect(resumeStateFor(row(), URL, { ...partial, exists: false }, 'android')).toBeUndefined();
  expect(resumeStateFor(row(), URL, { ...partial, size: 0 }, 'android')).toBeUndefined();
  expect(resumeStateFor(row(), URL, { ...partial, size: null }, 'android')).toBeUndefined();
  expect(resumeStateFor(row(), URL, partial, 'ios')).toBeUndefined();
});

it('extensionFor: MIME first, then the URL, then mp3', () => {
  expect(extensionFor('https://x/y.bin', 'audio/mp4')).toBe('m4a');
  expect(extensionFor('https://x/y.OGG?u=1')).toBe('ogg');
  expect(extensionFor('https://x/y')).toBe('mp3');
});
