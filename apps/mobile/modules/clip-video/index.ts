// Makes a clip into a short video with the phone's own encoders, and shares it.
/**
 * M19 (owner, 2026-10-05: "share a clip as a video", built with the phone's own encoders — no
 * FFmpeg). The native side (`ios/ClipVideoModule.swift`, AVAssetWriter + AVAssetExportSession;
 * `android/…/ClipVideoModule.kt`, Media3 Transformer) draws a 720×1280 picture at 15 fps — the
 * cover, the title, the show, the clip's heat bars and a moving playhead — under the clip's own
 * sound, and writes an .mp4 to the cache folder.
 *
 * `requireOptionalNativeModule`, not `requireNativeModule`: in Jest (and in a build made before
 * this module existed) there is no native side, and the app must simply not offer the row.
 */
import { requireOptionalNativeModule } from 'expo';

/** The longest clip that can become a video (60 s). */
export const MAX_CLIP_VIDEO_MS = 60_000;

/** Colours as `#rrggbb`; the native side has the same defaults (the app's tokens). */
export type ClipVideoPalette = { background: string; text: string; muted: string; primary: string; accent: string };

export type ClipVideoOptions = {
  /** A LOCAL audio file (`file://…`) — the downloaded episode, or one fetched to the cache. */
  audioUri: string;
  startMs: number;
  endMs: number;
  /** The cover: `https://…` or `file://…`. Without it a plain square is drawn. */
  coverUri?: string;
  title: string;
  show: string;
  /** The clip's heat bars, any scale (drawn relative to the tallest). May be empty. */
  heat: number[];
  palette?: ClipVideoPalette;
};

type Native = {
  makeClipVideo(options: ClipVideoOptions): Promise<{ uri: string }>;
  shareVideo(uri: string, title: string): Promise<void>;
};

const native = (): Native | null => requireOptionalNativeModule<Native>('ClipVideo');

/** True when this build has the native module (a build from before M19 does not). */
export function isAvailable(): boolean {
  return native() != null;
}

/** Rejects for a clip that is empty or longer than 60 s, or when the module is missing. */
export async function makeClipVideo(options: ClipVideoOptions): Promise<{ uri: string }> {
  const length = options.endMs - options.startMs;
  if (!(length > 0)) throw new Error('The clip has no length.');
  if (length > MAX_CLIP_VIDEO_MS) throw new Error('A video can be at most 60 seconds.');
  const m = native();
  if (m == null) throw new Error('This version of the app cannot make videos.');
  return m.makeClipVideo({ ...options, startMs: Math.round(options.startMs), endMs: Math.round(options.endMs) });
}

/** The phone's own share sheet with the .mp4 (iOS: the activity sheet; Android: the chooser). */
export async function shareVideo(uri: string, title: string): Promise<void> {
  const m = native();
  if (m == null) throw new Error('This version of the app cannot share videos.');
  await m.shareVideo(uri, title);
}
