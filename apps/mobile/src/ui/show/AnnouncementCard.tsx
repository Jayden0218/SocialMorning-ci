/**
 * The host's newest announcement as one card under the show header (owner, 2026-10-01, after
 * the 小宇宙 show page): a megaphone, "Announcement · 2026-09-30", the body in 2 lines, and a
 * tap that opens the whole text (and closes it again).
 */
import { useState } from 'react';
import { Box } from '../lib/box';
import { Pressable } from '../lib/pressable';
import { Text } from '../lib/text';
import { Icon } from '../Icon';
import { TAP } from '../TopBar';
import type { ShowExtras } from '../../social/api';

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
      className="bg-surface rounded-row p-row gap-1"
      style={TAP}
    >
      <Box className="flex-row items-center gap-1">
        <Icon name="megaphone-outline" size={14} color={props.iconColour} />
        <Text className="text-xs font-bold text-text">{heading}</Text>
      </Box>
      <Text className="text-sm text-text" {...(open ? {} : { numberOfLines: 2 })}>{props.announcement.body}</Text>
    </Pressable>
  );
}
