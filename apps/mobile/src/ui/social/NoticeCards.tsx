// Top of Notifications: System and From hosts open their pages; a switch between Interactions and People.
/**
 * The two cards at the top of Notifications (M10): System and People. M12 FR-001 (B2): on
 * the iPhone both were plain boxes — tapping did nothing. Each is now a tab that chooses what
 * the page lists below it, with the selected state a screen reader announces.
 *
 * M17 (`Following-B`): the cards become one pill track — the chosen half the yellow fill
 * with dark words, the other muted — each with its icon and its count of new items. Drawn here
 * rather than with the shared `Segmented` because that part takes a plain label only (no icon,
 * no badge). The line under the track is drawn by the page (guard G-B2,
 * __tests__/notifications.test.tsx).
 *
 * M21 US10 (T108): System and From hosts are no longer tabs — each is a card that opens its own
 * page (`/notifications/system`, `/notifications/hosts`), as in 小宇宙. The track now switches
 * between Interactions (replies, likes, mentions and follows aimed at you) and People (what the
 * listeners you follow did).
 *
 * M24 US20 (`Notifications-B`): People first and chosen when the page opens; the two tabs are
 * separate pills (dark when chosen). System and From hosts stay one tap away, as the two cards
 * under the pills.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { hit } from '@/design';

export type NoticeSection = 'interactions' | 'people';
export type NoticePage = 'system' | 'hosts';

const TAP = { minHeight: hit.min };
const BADGE = { minWidth: 22, height: 22 };

/** What each tab says under the track, and in its spoken name. */
export function noticeLine(section: NoticeSection, unread: number): string {
  if (section === 'interactions') return unread > 0 ? 'New replies, likes, mentions and follows' : 'Replies, likes, mentions and follows aimed at you';
  return unread > 0 ? 'New activity from people you follow' : 'People you follow';
}

function Tab(props: { title: string; line: string; icon: IconName; iconColour: string; selectedIconColour: string; badge?: number; selected: boolean; onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: props.selected }}
      accessibilityLabel={`${props.title}. ${props.badge ? `${props.badge} new. ` : ''}${props.line}`}
      className={`flex-row gap-2 rounded-pill items-center justify-center px-section ${props.selected ? 'bg-text' : 'bg-surface border border-border'}`}
      style={TAP}
    >
      <Icon name={props.icon} size={18} color={props.selected ? props.selectedIconColour : props.iconColour} />
      <Text className={props.selected ? 'text-background text-body font-bold' : 'text-text text-body font-semibold'}>{props.title}</Text>
      {props.badge ? (
        <Box className="rounded-pill bg-primary items-center justify-center px-1.5" style={BADGE}>
          <Text className="text-onPrimary text-xs font-bold">{props.badge > 99 ? '99+' : props.badge}</Text>
        </Box>
      ) : null}
    </Pressable>
  );
}

/**
 * The People / Interactions pills. `unread` is People's count; `interactionsUnread` is Interactions'.
 * M24 US20 (`Notifications-B`): two separate pills, People first — the chosen one dark with paper
 * words, the other white with a thin border; a new-count is a yellow badge with dark words.
 */
export function NoticeCards(props: { section: NoticeSection; unread: number; interactionsUnread?: number; iconColour: string; selectedIconColour?: string; onSelect: (s: NoticeSection) => void }): React.ReactElement {
  const chosen = props.selectedIconColour ?? props.iconColour;
  const mine = props.interactionsUnread ?? 0;
  return (
    <Box className="flex-row flex-wrap gap-2" accessibilityRole="tablist">
      <Tab
        title="People"
        line={noticeLine('people', props.unread)}
        icon="people-outline"
        iconColour={props.iconColour}
        selectedIconColour={chosen}
        {...(props.unread > 0 ? { badge: props.unread } : {})}
        selected={props.section === 'people'}
        onPress={() => props.onSelect('people')}
      />
      <Tab
        title="Interactions"
        line={noticeLine('interactions', mine)}
        icon="chatbubbles-outline"
        iconColour={props.iconColour}
        selectedIconColour={chosen}
        {...(mine > 0 ? { badge: mine } : {})}
        selected={props.section === 'interactions'}
        onPress={() => props.onSelect('interactions')}
      />
    </Box>
  );
}

function Entry(props: { title: string; line: string; icon: IconName; iconColour: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="link"
      accessibilityLabel={`${props.title}. ${props.line}`}
      className="flex-1 flex-row items-center gap-row bg-surface border border-border rounded-row px-row"
      style={TAP}
    >
      <Icon name={props.icon} size={20} color={props.iconColour} />
      <Box className="flex-1">
        <Text className="text-text text-body font-semibold" numberOfLines={1}>{props.title}</Text>
        <Text className="text-muted text-xs" numberOfLines={1}>{props.line}</Text>
      </Box>
      <Icon name="chevron-forward" size={16} color={props.iconColour} />
    </Pressable>
  );
}

/** M21 US10: the two cards above the track — each opens its own page. */
export function NoticeEntries(props: { iconColour: string; onOpen: (page: NoticePage) => void }): React.ReactElement {
  return (
    <Box className="flex-row gap-row mb-row">
      <Entry title="System" line="Messages from SocialNet" icon="notifications-outline" iconColour={props.iconColour} onPress={() => props.onOpen('system')} />
      <Entry title="From hosts" line="Shows you follow" icon="mic-outline" iconColour={props.iconColour} onPress={() => props.onOpen('hosts')} />
    </Box>
  );
}
