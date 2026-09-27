/**
 * M10b US5 — is an episode a video? The feed's declared enclosure type decides; when a feed
 * declares nothing useful, the file's extension does. SocialNet never hosts either — a video
 * streams from its publisher, like audio (Principle V).
 */
export type MediaKind = 'audio' | 'video';

const VIDEO_EXT = /\.(mp4|m4v|mov|webm)(?:[?#].*)?$/i;

export function mediaKindOf(enclosureType: string | undefined, enclosureUrl: string): MediaKind {
  const t = (enclosureType ?? '').trim().toLowerCase();
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  return VIDEO_EXT.test(enclosureUrl) ? 'video' : 'audio';
}
