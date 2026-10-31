// The current time in ms, read in one place so a screen that draws "5 min ago" does not call the clock while rendering.
/** The current time in ms. Screens that draw "5 min ago" read it here, so the clock is one place a test can replace. */
export function nowMs(): number {
  return Date.now();
}
