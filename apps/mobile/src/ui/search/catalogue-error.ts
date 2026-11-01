// The line Search shows when the catalogue could not answer.
/**
 * 035 B5. Pulled out of SearchPage so the rule can be tested: which failure says which line. "Needs a connection" is for a
 * real network failure only (`ApiError('network')`, no answer at all).
 */
import { ApiError } from '@/social/api';

export function catalogueMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Search failed.';
  if (e.code === 'network' && e.extra['timeout'] === true) return 'The catalogue is slow to answer — try again in a moment.';
  if (e.code === 'network') return 'The catalogue needs a connection — showing your library only.';
  if (e.code === 'locked') return 'Too many searches — try again in a moment.';
  if (e.code === 'unavailable') return 'The catalogue is not answering right now.';
  return e.message;
}
