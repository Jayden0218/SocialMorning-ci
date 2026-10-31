// Top of Notifications: System and From hosts open their pages; a switch between Interactions and People.
/**
 * The two cards at the top of Notifications (M10): System and People. M12 FR-001 (B2): on
 * the iPhone both were plain boxes — tapping did nothing. Each is now a tab that chooses what
 * the page lists below it, with the selected state a screen reader announces.
 *
 * M21 US10 (T108): System and From hosts are no longer tabs — each is a card that opens its own
 * page (`/notifications/system`, `/notifications/hosts`), as in 小宇宙. The track now switches
 * between Interactions (replies, likes, mentions and follows aimed at you) and People (what the
 * listeners you follow did).
 *
 * M24 US20 (`Notifications-B`): People first and chosen when the page opens.
 *
 * M31 W4-C (T052; design-pulse2 `social.html#notifications--people`): the switch is the bottom zone's capsule — a 44 raise track (padding 3,
 * 4 between) of two 38 choices (radius 19, padding 0 16, Geist 14), the chosen one light with void words in 700, each with its count in
 * a hot badge (min 16, radius 8, mono 10 / 600, void words). System and From hosts are two 1 x 1 mosaic tiles (84 tall, radius 22,
 * padding 12, in the 28 / 16 lane, 10 apart): the icon (22) at the top, "System ›" in Geist 600 14 and the line in mono 10 under it.
 * The spoken names are unchanged (`People. 3 new. …`, `System. Messages from SocialNet`).
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/kit/Text';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { colour, typeStyle } from '@/design';
import { ME_MOSAIC } from '@/ui/me/mosaic';

export type NoticeSection = 'interactions' | 'people';
export type NoticePage = 'system' | 'hosts';

/** The drawn numbers: the switch is 44 (the choices 38), a badge 16, a tile 84 with 12 of padding. */
export const NOTICE = { switchHeight: 44, switchPad: 3, switchGap: 4, choiceHeight: 38, choicePadX: 16, badge: 16, badgePadX: 4, tileHeight: 84, tilePad: 12, tileIcon: 22 } as const;

/** What each tab says under the track, and in its spoken name. */
export function noticeLine(section: NoticeSection, unread: number): string {
  if (section === 'interactions') return unread > 0 ? 'New replies, likes, mentions and follows' : 'Replies, likes, mentions and follows aimed at you';
  return unread > 0 ? 'New activity from people you follow' : 'People you follow';
}

function Tab(props: { title: string; line: string; badge?: number; selected: boolean; onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: props.selected }}
      accessibilityLabel={`${props.title}. ${props.badge ? `${props.badge} new. ` : ''}${props.line}`}
      hitSlop={{ top: 5, bottom: 5 }}
      className={`flex-row items-center justify-center ${props.selected ? 'bg-text' : ''}`}
      style={{ height: NOTICE.choiceHeight, paddingHorizontal: NOTICE.choicePadX, borderRadius: NOTICE.choiceHeight / 2, gap: 6 }}
    >
      <Text className={`text-pulse-compact ${props.selected ? 'text-void font-bold' : 'text-text2 font-semibold'}`} style={typeStyle('compact')}>{props.title}</Text>
      {props.badge ? (
        <Box testID="notice-badge" className="bg-hot items-center justify-center" style={{ minWidth: NOTICE.badge, height: NOTICE.badge, borderRadius: NOTICE.badge / 2, paddingHorizontal: NOTICE.badgePadX }}>
          <Type step="badge" className="text-void">{props.badge > 99 ? '99+' : props.badge}</Type>
        </Box>
      ) : null}
    </Pressable>
  );
}

/**
 * The People / Interactions switch. `unread` is People's count; `interactionsUnread` is Interactions'.
 * `iconColour` and `selectedIconColour` are kept for callers; the drawn switch has no icons.
 */
export function NoticeCards(props: { section: NoticeSection; unread: number; interactionsUnread?: number; iconColour?: string; selectedIconColour?: string; onSelect: (s: NoticeSection) => void }): React.ReactElement {
  const mine = props.interactionsUnread ?? 0;
  return (
    <Box
      accessibilityRole="tablist"
      testID="notice-switch"
      className="flex-row bg-raise self-start"
      style={{ height: NOTICE.switchHeight, borderRadius: NOTICE.switchHeight / 2, padding: NOTICE.switchPad, gap: NOTICE.switchGap }}
    >
      <Tab
        title="People"
        line={noticeLine('people', props.unread)}
        {...(props.unread > 0 ? { badge: props.unread } : {})}
        selected={props.section === 'people'}
        onPress={() => props.onSelect('people')}
      />
      <Tab
        title="Interactions"
        line={noticeLine('interactions', mine)}
        {...(mine > 0 ? { badge: mine } : {})}
        selected={props.section === 'interactions'}
        onPress={() => props.onSelect('interactions')}
      />
    </Box>
  );
}

function Entry(props: { title: string; line: string; icon: IconName; onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="link"
      accessibilityLabel={`${props.title}. ${props.line}`}
      className="flex-1 bg-raise justify-between"
      style={{ minHeight: NOTICE.tileHeight, borderRadius: ME_MOSAIC.radius, padding: NOTICE.tilePad }}
    >
      <Icon name={props.icon} size={NOTICE.tileIcon} color={colour.text} />
      <Box>
        <Type step="compact" className="text-text" numberOfLines={1}>{`${props.title} ›`}</Type>
        <Type step="tag" className="text-text3" numberOfLines={2}>{props.line}</Type>
      </Box>
    </Pressable>
  );
}

/** M21 US10: the two tiles above the thread — each opens its own page. `iconColour` is kept for callers. */
export function NoticeEntries(props: { iconColour?: string; onOpen: (page: NoticePage) => void }): React.ReactElement {
  return (
    <Box className="flex-row" style={{ marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right, gap: ME_MOSAIC.gap }} testID="notice-entries">
      <Entry title="System" line="Messages from SocialNet" icon="notifications-outline" onPress={() => props.onOpen('system')} />
      <Entry title="From hosts" line="Shows you follow" icon="mic-outline" onPress={() => props.onOpen('hosts')} />
    </Box>
  );
}
