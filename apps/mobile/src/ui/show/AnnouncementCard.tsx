// The host's newest announcement as a card; tap to read it all.
/**
 * The host's newest announcement as one card under the show header (owner, 2026-10-01, after
 * the 小宇宙 show page): a megaphone, "Announcement · 2026-09-30", the body in 2 lines, and a
 * tap that opens the whole text (and closes it again).
 *
 * M17 (`Show-B`): an Editorial card — the heading as an accent eyebrow, the host's words in the
 * serif. The megaphone is gone (B has none); `iconColour` is still accepted so callers stay as
 * they are. Same words, same tap, same accessible name.
 *
 * M31 W3-A (T040; design-pulse2 show `About` view, "From the host" in the Mosaic): a raise tile (radius 20, 14 of padding): the heading in
 * mono 11 hot-text capitals, the host's words in Geist 14/20 in the text colour, two lines until opened.
 */
import { useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Type } from '@/ui/kit/Type';
import { TAP } from '@/ui/kit/TopBar';
import { player } from '@/design/tokens';
import type { ShowExtras } from '@/social/api';

const TILE = { borderRadius: player.panelRadius, padding: player.panelPad };
const CAPS = { textTransform: 'uppercase' as const, letterSpacing: player.capTracking };

export type Announcement = ShowExtras['announcements'][number];

/** "Announcement · 2026-09-30"; the date is left out when the server sent none we can read. */
export function announcementHeading(a: Pick<Announcement, 'createdAt'>): string {
  const ms = Date.parse(a.createdAt);
  return Number.isNaN(ms) ? 'Announcement' : `Announcement · ${new Date(ms).toISOString().slice(0, 10)}`;
}

export function AnnouncementCard(props: { announcement: Announcement; iconColour: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const heading = announcementHeading(props.announcement);
  return (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      accessibilityRole="button"
      accessibilityLabel={`${heading}. ${props.announcement.body}`}
      accessibilityHint={open ? 'Shows less' : 'Shows the whole announcement'}
      accessibilityState={{ expanded: open }}
      className="bg-raise gap-hair"
      style={[TAP, TILE]}
    >
      <Type step="tag" className="text-hotText" style={CAPS}>{heading}</Type>
      <Type step="note" className="text-text" {...(open ? {} : { numberOfLines: 2 })}>{props.announcement.body}</Type>
    </Pressable>
  );
}
