// The parts the Notifications pages share: the day grouping, a raise card, the unread dot.
/**
 * M31 W4-C (T052), restyled by spec 039 I2 (design B). The spine column, the day blocks with their vertical section headings and the stale line had no page left
 * drawing them once Notifications moved onto `Page` (a `Section` per day, an `InlineNotice` for a stale list), and are deleted. What stays:
 *
 *  - `groupByDay`: consecutive items under one day heading ("Today", "Yesterday", then the date).
 *  - `NotifCard`: raise, radius 16 (`radius.row`), padding 16 (`spacing.section`), 8 between its parts; an unread card has a 3 wide hot edge.
 *  - `UnreadDot`: the hot dot of an unread notice; the newest one glows.
 *  - `NOTIF`: the sizes of the parts inside a card (avatar, cover, picture, the unread edge).
 */
import type { ReactNode } from 'react';
import { Box } from '@/ui/lib/box';
import { colour, radius, spacing } from '@/design';

export const NOTIF = {
  /** An unread dot is 10; the newest one glows. */
  dot: 10,
  dotGlow: 10,
  /** A System card: the icon square 28. */
  square: 28,
  squareRadius: radius.chip,
  /** A host card: the show's cover 36 ; pictures 120 x 90, 8 apart. */
  hostCover: 36,
  hostCoverRadius: radius.small,
  pictureW: 120,
  pictureH: 90,
  pictureGap: 8,
  /** A feed card's parts: avatar 28, kind icon 16, episode cover 28. */
  feedAvatar: 28,
  feedCover: 28,
  feedCoverRadius: radius.chip,
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

/** The raise card of a notice; `pad` and `gap` are for a card that needs other than the token steps. */
export function NotifCard(props: { children: ReactNode; pad?: number; gap?: number; testID?: string; unread?: boolean }): React.ReactElement {
  return (
    <Box testID={props.testID ?? 'notif-card'} className="bg-raise overflow-hidden" style={{ borderRadius: radius.row, padding: props.pad ?? spacing.section, gap: props.gap ?? spacing.gap }}>
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
