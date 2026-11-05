// The parts of the 039 Notifications page: a chip row, a day heading, and one card per item.
/**
 * Spec 039 US1/US2 (`design/B-Notifications.dc.html`). The page is a `Page`; these are what sits in it. A day is a small caps heading (no vertical
 * label, no rail). An item is ONE card (raise, radius 24, padding 16, 12 between parts): the person and what they did on one line with the
 * time of day at the right, the comment in quotes when the item has one, and an episode strip (play glyph, title, the moment's time once).
 * One chip row holds the People / Interactions switch (with its unread badge) and the two links, System › and Hosts ›.
 */
import { ScrollView, useWindowDimensions } from 'react-native';
import type { ReactNode } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/kit/Text';
import { Type } from '@/ui/kit/Type';
import { Icon } from '@/ui/kit/Icon';
import { Avatar } from '@/ui/kit/Avatar';
import { mmss } from '@/ui/kit/format';
import { goBack } from '@/ui/kit/PageHeader';
import { bars, colour, gutter, radius, spacing } from '@/design';
import { Link } from '@/design/tailwind';
import type { FeedItem as Item } from '@/social/api';
import { describe } from '@/ui/social/FeedItem';
import { noticeLine, type NoticePage, type NoticeSection } from '@/ui/social/NoticeCards';
import { clockLabel } from '@/ui/chat/nodes';
import { NOTIF, UnreadDot } from '@/ui/notifications/parts';

const HIT = { top: 5, bottom: 5 };
const NAME_SLOP = { top: 12, bottom: 12, left: 4, right: 4 };
const KIND_VERB: Record<Item['kind'], string> = { listened: 'listened', clipped: 'clipped', commented: 'commented' };

/** Back, in the page's title row. */
export function BackButton(): React.ReactElement {
  return (
    <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel="Back" className="items-center justify-center" style={{ width: bars.titleBack, height: bars.titleBack, marginLeft: -spacing.row }}>
      <Icon name="arrow-back" size={22} color={colour.text} />
    </Pressable>
  );
}

function Chip(props: { title: string; label: string; role: 'tab' | 'link'; selected?: boolean; badge?: number; onPress: () => void }): React.ReactElement {
  const on = props.selected === true;
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole={props.role}
      {...(props.role === 'tab' ? { accessibilityState: { selected: on } } : {})}
      accessibilityLabel={props.label}
      hitSlop={HIT}
      className="justify-center"
      style={{ minHeight: bars.circle, marginVertical: -(bars.circle - bars.chip) / 2 }}
    >
      <Box
        testID="frame-pill"
        className={`flex-row items-center justify-center rounded-pill ${on ? 'bg-text' : props.role === 'link' ? 'border border-line' : 'bg-raise2'}`}
        style={{ height: bars.chip, paddingHorizontal: bars.chipPad, gap: spacing.hair + 2 }}
      >
        <Type step="small" className={on ? 'text-void font-semibold' : 'text-text'} numberOfLines={1}>{props.title}</Type>
        {props.badge ? (
          <Box testID="notice-badge" className="bg-hot items-center justify-center" style={{ minWidth: bars.badge, height: bars.badge, borderRadius: bars.badge / 2, paddingHorizontal: spacing.hair }}>
            <Type step="badge" className="text-void">{props.badge > 99 ? '99+' : props.badge}</Type>
          </Box>
        ) : null}
      </Box>
    </Pressable>
  );
}

/** ONE row: People, Interactions (its unread badge on each), then System › and Hosts › that open their own pages. */
export function NoticeChips(props: { section: NoticeSection; unread: number; interactionsUnread: number; onSelect: (s: NoticeSection) => void; onOpen: (page: NoticePage) => void }): React.ReactElement {
  const { width } = useWindowDimensions();
  const side = gutter(width);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="notice-chips" style={{ marginHorizontal: -side }} contentContainerStyle={{ paddingHorizontal: side, gap: spacing.gap, alignItems: 'center' }} accessibilityRole="tablist">
      <Chip title="People" role="tab" selected={props.section === 'people'} {...(props.unread > 0 ? { badge: props.unread } : {})}
        label={`People. ${props.unread > 0 ? `${props.unread} new. ` : ''}${noticeLine('people', props.unread)}`} onPress={() => props.onSelect('people')} />
      <Chip title="Interactions" role="tab" selected={props.section === 'interactions'} {...(props.interactionsUnread > 0 ? { badge: props.interactionsUnread } : {})}
        label={`Interactions. ${props.interactionsUnread > 0 ? `${props.interactionsUnread} new. ` : ''}${noticeLine('interactions', props.interactionsUnread)}`} onPress={() => props.onSelect('interactions')} />
      <Chip title="System ›" role="link" label="System. Messages from SocialNet" onPress={() => props.onOpen('system')} />
      <Chip title="Hosts ›" role="link" label="Hosts. Shows you follow" onPress={() => props.onOpen('hosts')} />
    </ScrollView>
  );
}

/** A day's name in the small caps tag style. */
export function DayHeading(props: { label: string }): React.ReactElement {
  return <Type step="tag" accessibilityRole="header" className="text-text2 uppercase">{props.label}</Type>;
}

/** A day: its heading, then its cards, `spacing.row` apart. */
export function Day(props: { label: string; children: ReactNode }): React.ReactElement {
  return (
    <Box testID="day" style={{ gap: spacing.row }}>
      <DayHeading label={props.label} />
      {props.children}
    </Box>
  );
}

/** The raise card every item sits in. `unread` hangs the 3 wide hot edge on its left. */
export function ItemCard(props: { children: ReactNode; testID: string; unread?: boolean }): React.ReactElement {
  return (
    <Box testID={props.testID} className="bg-raise overflow-hidden" style={{ borderRadius: radius.card, padding: spacing.section, gap: spacing.row }}>
      {props.unread ? <Box testID="notif-unread-edge" className="absolute bg-hot" style={{ left: 0, top: 0, bottom: 0, width: NOTIF.noticeEdge }} accessible={false} importantForAccessibility="no-hide-descendants" /> : null}
      {props.children}
    </Box>
  );
}

/** The episode strip: a play glyph, the episode's title and, when the item points at a moment, that time once. */
export function EpisodeStrip(props: { title: string; momentMs?: number | null }): React.ReactElement {
  return (
    <Box testID="feed-episode" className="flex-row items-center bg-raise2" style={{ gap: spacing.row - 2, padding: spacing.gap, borderRadius: radius.row }}>
      <Box className="items-center justify-center bg-hotSoft" style={{ width: spacing.group, height: spacing.group, borderRadius: spacing.group / 2 }} accessible={false} importantForAccessibility="no-hide-descendants">
        <Icon name="play" size={spacing.row} color={colour.hotText} />
      </Box>
      <Type step="small" className="text-text flex-1" numberOfLines={1}>{props.title}</Type>
      {props.momentMs !== null && props.momentMs !== undefined ? <Type step="time" className="text-hotText">{mmss(props.momentMs)}</Type> : null}
    </Box>
  );
}

/** A People item: the person (their name opens the profile) and what they did, the time at the right, and the episode strip; tapping opens the moment. */
export function FeedCard(props: { item: Item; onOpen: (item: Item) => void }): React.ReactElement {
  const { item } = props;
  const name = item.actor.displayName ?? 'Deleted account';
  return (
    <Pressable onPress={() => props.onOpen(item)} accessibilityRole="button" accessibilityLabel={`${item.actor.displayName ?? 'Someone'} ${describe(item)}`}>
      <ItemCard testID="feed-card">
        <Box className="flex-row items-center" style={{ gap: spacing.row - 2 }}>
          <Avatar size={NOTIF.noticeAvatar} name={name} />
          <Box className="flex-1 flex-row flex-wrap items-center">
            <Link href={{ pathname: '/profile/[id]', params: { id: item.actor.id } }} asChild>
              <Pressable accessibilityRole="link" hitSlop={NAME_SLOP} className="flex-shrink min-w-0">
                {/* A name is not an action (owner's K1 note, 2026-09-25): weight tells it apart. */}
                <Type step="strong" className="text-text font-bold" numberOfLines={1}>{name}</Type>
              </Pressable>
            </Link>
            <Type step="strong" className="text-text2 font-normal">{` ${KIND_VERB[item.kind]}`}</Type>
          </Box>
          <Type step="time" className="text-text2">{clockLabel(new Date(item.createdAt))}</Type>
        </Box>
        <EpisodeStrip title={item.episode.title} momentMs={item.momentMs} />
      </ItemCard>
    </Pressable>
  );
}

/** An Interactions item: the person and what they did (verb in the secondary colour), the comment quoted, the episode, the time at the right; `more` is the ⋯. */
export function NoticeItemCard(props: { testID?: string; unread: boolean; glow: boolean; who: string; verb: string; avatar: ReactNode; time: string; excerpt: string | undefined; episodeTitle: string | undefined; label: string; onOpen: () => void; onMore?: () => void; moreLabel: string }): React.ReactElement {
  return (
    <ItemCard testID={props.testID ?? 'notice-card'} unread={props.unread}>
      <Box className="flex-row items-start" style={{ gap: spacing.gap }}>
        <Pressable onPress={props.onOpen} accessibilityRole="link" accessibilityLabel={props.label} className="flex-1" style={{ gap: spacing.row }}>
          <Box className="flex-row items-center" style={{ gap: spacing.row - 2 }}>
            {props.avatar}
            <Type step="strong" className="flex-1 text-text" numberOfLines={2}><Text className="text-text font-bold">{props.who}</Text><Text className="text-text2 font-normal">{` ${props.verb}`}</Text></Type>
            {props.unread ? <UnreadDot glow={props.glow} /> : null}
            <Type testID="notice-time" step="time" className="text-text2">{props.time}</Type>
          </Box>
          {props.excerpt ? <Type step="body" className="text-text" numberOfLines={3}>{`“${props.excerpt}”`}</Type> : null}
          {props.episodeTitle ? <EpisodeStrip title={props.episodeTitle} /> : null}
        </Pressable>
        {props.onMore ? (
          <Pressable onPress={props.onMore} accessibilityRole="button" accessibilityLabel={props.moreLabel} hitSlop={spacing.gap + 2} className="items-center justify-center">
            <Icon name="ellipsis-horizontal" size={NOTIF.noticeMore} color={colour.text2} />
          </Pressable>
        ) : null}
      </Box>
    </ItemCard>
  );
}

/** Nothing here yet: the title, then the line. */
export function EmptyBlock(props: { title: string; line: string }): React.ReactElement {
  return (
    <Box testID="page-empty" className="items-center" style={{ gap: spacing.gap, paddingVertical: spacing.group }} accessible accessibilityLabel={`${props.title} ${props.line}`}>
      <Type step="heading" className="text-text text-center">{props.title}</Type>
      <Type step="body" className="text-text2 text-center">{props.line}</Type>
    </Box>
  );
}
