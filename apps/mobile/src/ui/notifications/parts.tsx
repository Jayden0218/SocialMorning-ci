// The parts the Notifications pages share: a day-grouped thread on the spine, a raise card, and the stale line.
/**
 * M31 W4-C (T052; design-pulse2 `social.html` `notifBase`, `hostsBase`, `systemBase`; layout pattern Thread). Every number below is read
 * off those drawings:
 *
 *  - Thread: the spine at x 40 (the comments lane's `SpineLine`, hot to violet to line), 10 under its top; nodes 18 apart, 18 from
 *    the left and 20 from the right; a node is a head (the 46 column with a tick or a dot centred on the spine) over a card 56 in.
 *  - Day group: the day named by an edge label on the left (Unbounded 11, vertical) — "Today", "Yesterday", then the date.
 *  - Card: raise, radius 18, padding 12 (System 14), 8–10 between its parts.
 *  - Stale line: "Couldn't refresh — showing what was fetched at 9:41" on a raise line above the spine.
 *
 * The spine is part of the scrolling content here (the tiles above it scroll away), so it starts under them and runs to the last node.
 */
import type { ReactNode } from 'react';
import { Box } from '@/ui/lib/box';
import { Type } from '@/ui/kit/Type';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { colour, gutter } from '@/design';
import { useWindowDimensions } from 'react-native';
import { SpineLine } from '@/ui/comments/Spine';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { LIST, ThreadNode } from '@/ui/me/lists';

export const NOTIF = {
  /** The tiles sit 8 under the status bar (58 on the drawing) and the spine starts 28 under their foot. */
  tilesBelowStatus: 8,
  tilesToSpine: 18,
  /** A day group is at least this tall, so its vertical label never runs into the next group's. */
  groupMin: 110,
  /** The label's own offset in its group. */
  labelTop: 14,
  /** An unread dot is 10; the newest one glows. */
  dot: 10,
  dotGlow: 10,
  /** The error card: padding 14, 10 between its parts; Retry is 40. */
  errPad: 14,
  errGap: 10,
  /** A System card: padding 14, 8 between parts; the icon square 28, radius 9; the action is 40. */
  systemPad: 14,
  systemGap: 8,
  square: 28,
  squareRadius: 9,
  /** A host card: the show's cover 36 (radius 10); pictures 120 x 90, 8 apart. */
  hostCover: 36,
  hostCoverRadius: 10,
  pictureW: 120,
  pictureH: 90,
  pictureGap: 8,
  /** The stale line. */
  staleRadius: 14,
  /** A feed card's parts: avatar 28, kind icon 16, episode cover 28 (radius 8). */
  feedAvatar: 28,
  feedCover: 28,
  feedCoverRadius: 8,
  feedIcon: 16,
  /** An interaction card: avatar 36, the 3 wide unread edge, the ⋯ 18. */
  noticeAvatar: 36,
  noticeEdge: 3,
  noticeMore: 18,
} as const;

export type DayGroup<T> = { key: string; label: string; items: T[] };

/** Consecutive items under one day heading ("Today", "Yesterday", then the date), in the order given. */
export function groupByDay<T>(items: readonly T[], at: (item: T) => string, now: Date): DayGroup<T>[] {
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const out: DayGroup<T>[] = [];
  for (const item of items) {
    const d = new Date(at(item));
    const key = dayKey(d);
    const last = out[out.length - 1];
    if (last && last.key === key) { last.items.push(item); continue; }
    const label = key === today ? 'Today' : key === yesterday ? 'Yesterday' : d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' as const }) });
    out.push({ key, label, items: [item] });
  }
  return out;
}

/** The spine's column: the line behind, and `children` (day groups) hung from it. */
export function SpineColumn(props: { children: ReactNode }): React.ReactElement {
  return (
    <Box testID="spine-column" style={{ paddingTop: LIST.top }}>
      <SpineLine />
      <Box style={{ gap: LIST.nodeGap }}>{props.children}</Box>
    </Box>
  );
}

/** One day's nodes with its edge label; `label` is omitted by pages that name no day (From hosts has one for the week). */
export function DayBlock(props: { label?: string; spoken?: string; children: ReactNode }): React.ReactElement {
  const { width } = useWindowDimensions();
  return (
    <Box className="relative" style={{ minHeight: props.label ? NOTIF.groupMin : undefined }} testID="day-block">
      {props.label ? <EdgeLabel label={props.label} {...(props.spoken ? { spoken: props.spoken } : {})} top={NOTIF.labelTop} /> : null}
      <Box style={{ paddingLeft: LIST.left, paddingRight: gutter(width), gap: LIST.nodeGap }}>{props.children}</Box>
    </Box>
  );
}

/** A node: a head over a card 56 in. Same as the Me lists' `ThreadNode`. */
export { ThreadNode };

/** The raise card of a node; `pad` is 12 for most cards, 14 for System and the error card. */
export function NotifCard(props: { children: ReactNode; pad?: number; gap?: number; testID?: string; unread?: boolean }): React.ReactElement {
  return (
    <Box testID={props.testID ?? 'notif-card'} className="bg-raise overflow-hidden" style={{ borderRadius: LIST.cardRadius, padding: props.pad ?? LIST.cardPad, gap: props.gap ?? 8 }}>
      {props.unread ? <Box testID="notif-unread-edge" className="absolute bg-hot" style={{ left: 0, top: 0, bottom: 0, width: NOTIF.noticeEdge }} accessible={false} importantForAccessibility="no-hide-descendants" /> : null}
      {props.children}
    </Box>
  );
}

/** The hot dot of an unread notice; the newest one glows. */
export function UnreadDot(props: { glow?: boolean }): React.ReactElement {
  return (
    <Box
      testID="unread-dot"
      className="bg-hot"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: NOTIF.dot, height: NOTIF.dot, borderRadius: NOTIF.dot / 2, ...(props.glow ? { shadowColor: colour.hot, shadowOpacity: 1, shadowRadius: NOTIF.dotGlow, shadowOffset: { width: 0, height: 0 } } : null) }}
    />
  );
}

/** "Couldn't refresh — showing what was fetched at 9:41", a raise line above the spine. */
export function StaleLine(props: { text: string }): React.ReactElement {
  return (
    <Box testID="stale-line" className="bg-raise" style={{ marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right, marginBottom: 12, padding: 12, borderRadius: NOTIF.staleRadius }}>
      <Type step="caption" className="text-hotText">{props.text}</Type>
    </Box>
  );
}
