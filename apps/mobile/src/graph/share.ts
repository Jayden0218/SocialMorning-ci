/** The share sheet (research R2): React Native's own `Share`, the link in the text. */
import type { Clip } from '../social/api';
import { clipLinkFor } from './links';
import { mmss } from '../ui/format';

export type ShareLike = { share(content: { message: string; title?: string }): Promise<unknown> };

export function shareText(clip: Clip, episodeTitle: string, baseUrl: string): string {
  const range = `${mmss(clip.startMs)}–${mmss(clip.endMs)}`;
  const head = clip.caption ? `${clip.caption} — ` : '';
  return `${head}${episodeTitle} (${range}) ${clipLinkFor(clip.id, baseUrl)}`;
}

export async function shareClip(share: ShareLike, clip: Clip, episodeTitle: string, baseUrl: string): Promise<void> {
  try { await share.share({ message: shareText(clip, episodeTitle, baseUrl), title: episodeTitle }); } catch { /* the sheet was dismissed */ }
}
