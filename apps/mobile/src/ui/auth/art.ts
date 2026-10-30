// The words-only tiles that move along the sign-in page.
/**
 * The sign-in page's moving row (owner, 2026-10-04): tiles made here, words only — no show
 * covers. The owner has no permission to show other people's podcast artwork, so nothing on
 * this page comes from a feed, Discover or the listener's subscriptions. Each tile says one
 * thing SocialNet does; `tone` picks one of three palette fills.
 */
export type ArtTone = 'primary' | 'surface' | 'dark';
export type ArtTile = { kicker: string; title: string; tone: ArtTone };

export const LANDING_TILES: readonly ArtTile[] = [
  { kicker: 'Comments', title: 'Talk at the exact second you heard it', tone: 'primary' },
  { kicker: 'Heat curve', title: 'See where everyone leaned in', tone: 'surface' },
  { kicker: 'Clips', title: 'Keep the part worth sharing', tone: 'dark' },
  { kicker: 'Friends', title: 'Hear what your friends are playing', tone: 'primary' },
  { kicker: 'For You', title: 'New shows picked for how you listen', tone: 'surface' },
  { kicker: 'Queue', title: 'Line up tonight, offline too', tone: 'dark' },
  { kicker: 'Free', title: 'Listening is free, always', tone: 'primary' },
];
