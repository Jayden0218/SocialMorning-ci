/**
 * The host's newest announcement as one card under the show header (owner, 2026-10-01, after
 * the 小宇宙 show page): a megaphone, "Announcement · 2026-09-30", the body in 2 lines, and a
 * tap that opens the whole text (and closes it again).
 *
 * M17 (`Show-B`): an Editorial card — the heading as an accent eyebrow, the host's words in the
 * serif. The megaphone is gone (B has none); `iconColour` is still accepted so callers stay as
 * they are. Same words, same tap, same accessible name.
 */
import { useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { TAP } from '@/ui/kit/TopBar';
import type { ShowExtras } from '@/social/api';

/** The eyebrow's spaced capitals (as `Eyebrow`, which is a header, not part of a button). */
const CAPS = { letterSpacing: 1.3, textTransform: 'uppercase' as const };

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
      className="bg-surface border border-border rounded-row px-section py-row gap-1"
      style={TAP}
    >
      <Text className="text-micro font-bold text-accent" style={CAPS}>{heading}</Text>
      <Text className="text-sm font-display-semibold text-text leading-[22px]" {...(open ? {} : { numberOfLines: 2 })}>{props.announcement.body}</Text>
    </Pressable>
  );
}
