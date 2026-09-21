/**
 * The hash moved to `@socialmorning/social-core` (M3 T013): the server needs
 * the SAME episode id the phone computes — `fnv1a64(feedUrl + '\u0001' + guid)`
 * — and one implementation is the only way two sides agree forever. This file
 * stays so nothing on the phone has to change its import.
 */
export { fnv1a64, hash } from '@socialmorning/social-core';
