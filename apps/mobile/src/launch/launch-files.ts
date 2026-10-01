/**
 * M15 US3 (research R5): launch-screen images in `Paths.cache/launch/`, on expo-file-system
 * 58's object API — the same calls `src/downloads/expo-downloader.ts` uses, read from the
 * installed typings (`node_modules/expo-file-system/build/File.d.ts`: `downloadFileAsync`
 * with `{ idempotent }`; `Directory.list()`, `.exists`, `.create()`; `File.delete()`).
 *
 * The second file allowed to import expo-file-system (the isolation rule stated in
 * `src/downloads/expo-downloader.ts`): everything above this adapter takes a
 * `LaunchFiles` and runs in Node.
 *
 * The cache directory may be emptied by the OS at any time; `uri` checks the disk, so a
 * cleared image means "not cached", never a blank launch screen.
 */
import { Directory, File, Paths } from 'expo-file-system';

export type LaunchFiles = {
  /** The image's file URI, or undefined when it is not on disk. Synchronous. */
  uri(id: string): string | undefined;
  /** Every promotion id with an image on disk. */
  ids(): string[];
  download(id: string, url: string): Promise<void>;
  remove(id: string): void;
};

/** jpg / png / webp from the URL; anything else is saved as .jpg (the image decoder reads the bytes). */
export function imageExtension(url: string): string {
  const m = /\.(jpe?g|png|webp)(?:[?#]|$)/i.exec(url);
  return m ? m[1]!.toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

const idOf = (name: string): string => name.replace(/\.[^.]+$/, '');

export function createLaunchFiles(): LaunchFiles {
  const dir = (): Directory => new Directory(Paths.cache, 'launch');
  const files = (): File[] => {
    const d = dir();
    if (!d.exists) return [];
    return d.list().filter((e): e is File => e instanceof File);
  };
  const find = (id: string): File | undefined => files().find((f) => idOf(f.name) === id && f.exists);
  return {
    uri: (id) => {
      try { return find(id)?.uri; } catch { return undefined; }
    },
    ids: () => {
      try { return files().map((f) => idOf(f.name)); } catch { return []; }
    },
    async download(id, url) {
      const d = dir();
      if (!d.exists) d.create({ intermediates: true, idempotent: true });
      await File.downloadFileAsync(url, new File(d, `${id}.${imageExtension(url)}`), { idempotent: true });
    },
    remove: (id) => {
      try { for (const f of files()) if (idOf(f.name) === id) f.delete(); } catch { /* the OS may have taken it already */ }
    },
  };
}
