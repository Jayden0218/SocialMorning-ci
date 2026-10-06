// Says when voice boost can work on this phone, and when an episode greys out boost and skip silence.
/**
 * M21 US11 (research R2). Pure rules for the audio rows (src/ui/settings/AudioRows.tsx):
 *   - Android's voice boost is DynamicsProcessing, which exists from Android 9 (API 28); below
 *     that the row is hidden. The iPhone does it in expo-audio's audio tap, always present.
 *   - On iPhone an HLS stream (an `.m3u8` address) gets no audio-tap buffers (Apple forum 45966),
 *     so neither the boost nor skip silence can act on it: both rows are greyed out there.
 *     Android's Media3 handles HLS like any other stream.
 */

/** DynamicsProcessing's first Android version (API level). */
export const VOICE_BOOST_MIN_ANDROID = 28;

export function voiceBoostSupported(os: string, version: number | string): boolean {
  if (os === 'ios') return true;
  if (os === 'android') return Number(version) >= VOICE_BOOST_MIN_ANDROID;
  return false;
}

/** An HLS playlist address: its path (not its query) ends in `.m3u8`. */
export function isHlsUrl(url: string | undefined): boolean {
  if (url === undefined) return false;
  const path = url.split(/[?#]/, 1)[0] ?? '';
  return path.toLowerCase().endsWith('.m3u8');
}

/** True when this episode cannot take voice boost or skip silence on this phone. */
export function effectsBlocked(os: string, url: string | undefined): boolean {
  return os === 'ios' && isHlsUrl(url);
}
