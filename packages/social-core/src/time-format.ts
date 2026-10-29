// Formats a millisecond position as mm:ss, or h:mm:ss past an hour.
/** `m:ss`, or `h:mm:ss` once a position passes an hour; negative counts as 0. */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
