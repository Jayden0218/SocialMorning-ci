// Reads the optional text of a voice post or comment from its upload's x-transcript header.
/**
 * M20 US3 (spec FR-006; contracts/api.md "Voice text"): the body of a voice upload is the raw
 * audio, so the text the listener checked comes in a header, URI-encoded UTF-8. Absent or blank
 * = no text. Over 2000 characters, or not decodable, is refused rather than cut: the listener
 * saw every word they post.
 */
import { ApiError } from '../errors.ts';

export const TRANSCRIPT_MAX = 2000;

export function readTranscript(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  let text: string;
  try {
    text = decodeURIComponent(header);
  } catch {
    throw new ApiError('validation', 'x-transcript must be URI-encoded text.', { fields: ['x-transcript'] });
  }
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length === 0) return undefined;
  if (text.length > TRANSCRIPT_MAX) throw new ApiError('validation', `The text is at most ${TRANSCRIPT_MAX} characters.`, { fields: ['x-transcript'] });
  return text;
}
