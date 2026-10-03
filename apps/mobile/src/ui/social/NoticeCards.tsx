/**
 * The two cards at the top of Notifications (M10): System and People. M12 FR-001 (B2): on
 * the iPhone both were plain boxes — tapping did nothing. Each is now a tab that chooses what
 * the page lists below it, with the selected state a screen reader announces.
 *
 * M17 (`Following-B`): the two cards become one pill track — the chosen half the yellow fill
 * with dark words, the other muted — each with its icon, People with its count of new items.
 * Drawn here rather than with the shared `Segmented` because that part takes a plain label
 * only (no icon, no badge). The line under the track is drawn by the page. Same names, same
 * `onSelect` (guard G-B2, __tests__/notifications.test.tsx).
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Icon, type IconName } from '@/ui/kit/Icon';
import { hit } from '@/design';

export type NoticeSection = 'people' | 'system';

const TAP = { minHeight: hit.min };

/** What each tab says under the track, and in its spoken name. */
export function noticeLine(section: NoticeSection, unread: number): string {
  if (section === 'system') return 'Messages from SocialNet';
  return unread > 0 ? 'New activity from people you follow' : 'People you follow';
}

function Tab(props: { title: string; line: string; icon: IconName; iconColour: string; selectedIconColour: string; badge?: number; selected: boolean; onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: props.selected }}
      accessibilityLabel={`${props.title}. ${props.badge ? `${props.badge} new. ` : ''}${props.line}`}
      className={`flex-1 flex-row gap-1.5 rounded-pill items-center justify-center ${props.selected ? 'bg-primary' : ''}`}
      style={TAP}
    >
      <Icon name={props.icon} size={16} color={props.selected ? props.selectedIconColour : props.iconColour} />
      <Text className={props.selected ? 'text-onPrimary text-body font-bold' : 'text-muted text-body'}>{props.title}</Text>
      {props.badge ? (
        <Box className={`rounded-pill min-w-5 px-1.5 items-center justify-center ${props.selected ? 'bg-onPrimary' : 'bg-accent'}`}>
          <Text className={props.selected ? 'text-primary text-micro font-bold' : 'text-background text-micro font-bold'}>{props.badge > 99 ? '99+' : props.badge}</Text>
        </Box>
      ) : null}
    </Pressable>
  );
}

export function NoticeCards(props: { section: NoticeSection; unread: number; iconColour: string; selectedIconColour?: string; onSelect: (s: NoticeSection) => void }): React.ReactElement {
  const chosen = props.selectedIconColour ?? props.iconColour;
  return (
    <Box className="flex-row gap-1 p-1 bg-surface border border-border rounded-pill" accessibilityRole="tablist">
      <Tab title="System" line={noticeLine('system', props.unread)} icon="notifications-outline" iconColour={props.iconColour} selectedIconColour={chosen} selected={props.section === 'system'} onPress={() => props.onSelect('system')} />
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
    </Box>
  );
}
