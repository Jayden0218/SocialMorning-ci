// The limits the server checks and the Studio shows, kept in one place so they never drift.
/**
 * M23 T043 (US10): before this file the ban reason, host picks, upload sizes and queue length
 * were copied by hand into the API and the Studio. Both now import them from here.
 */
import { QUEUE_MAX } from '@socialmorning/player-core';

/** A ban's private reason, in characters (column `show_mutes.reason`, migration 021). */
export const BAN_REASON_MAX = 200;
/** Episodes a host can star as "Host picks" on the show page. */
export const HOST_PICKS_MAX = 20;
/** One episode audio file uploaded in the Studio. */
export const MAX_AUDIO_BYTES = 200 * 1024 * 1024;
/** One cover or announcement picture (JPEG/PNG). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** One launch-screen image (Admin). */
export const MAX_LAUNCH_IMAGE_BYTES = 1_048_576;
/** Episodes in the play queue, on the phone and in the synced copy (the rule lives in player-core). */
export const SYNCED_QUEUE_MAX = QUEUE_MAX;
