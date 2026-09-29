/**
 * The two cards at the top of Notifications (M10): System and People. M12 FR-001 (B2): on
 * the iPhone both were plain boxes — tapping did nothing. Each is now a tab that chooses what
 * the page lists below it, with the selected state a screen reader announces.
 */
import { Pressable } from './lib/pressable';
import { Text } from './lib/text';
import { Box } from './lib/box';
import { Icon, type IconName } from './Icon';

export type NoticeSection = 'people' | 'system';

function Card(props: { title: string; line: string; icon: IconName; iconColour: string; badge?: number; selected: boolean; onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: props.selected }}
      accessibilityLabel={`${props.title}. ${props.badge ? `${props.badge} new. ` : ''}${props.line}`}
      className={`flex-1 rounded-artwork p-section bg-surface ${props.selected ? 'border-2 border-primary' : 'border-2 border-surface'}`}
    >
      <Box className="flex-row items-center gap-2">
        <Text className="text-text text-sm font-bold">{props.title}</Text>
        {props.badge ? <Box className="bg-accent rounded-pill min-w-6 h-6 px-1 items-center justify-center"><Text className="text-onPrimary text-xs font-bold">{props.badge > 99 ? '99+' : props.badge}</Text></Box> : null}
      </Box>
      <Text className="text-muted text-xs mt-1">{props.line}</Text>
      <Box className="self-end mt-row"><Icon name={props.icon} size={24} color={props.iconColour} /></Box>
    </Pressable>
  );
}

export function NoticeCards(props: { section: NoticeSection; unread: number; iconColour: string; onSelect: (s: NoticeSection) => void }): React.ReactElement {
  return (
    <Box className="flex-row gap-row mb-section" accessibilityRole="tablist">
      <Card title="System" line="Messages from SocialNet" icon="notifications-outline" iconColour={props.iconColour} selected={props.section === 'system'} onPress={() => props.onSelect('system')} />
      <Card
        title="People"
        line={props.unread > 0 ? 'New activity from people you follow' : 'People you follow'}
        icon="people-outline"
        iconColour={props.iconColour}
        {...(props.unread > 0 ? { badge: props.unread } : {})}
        selected={props.section === 'people'}
        onPress={() => props.onSelect('people')}
      />
    </Box>
  );
}
