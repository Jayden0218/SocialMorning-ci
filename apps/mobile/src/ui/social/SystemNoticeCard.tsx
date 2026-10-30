// One message from SocialNet: title, text, time, and at most one button that opens a page in the app.
/**
 * M21 US10 (T108): a system card may carry one in-app button. Its route comes from the notice's
 * payload through `systemAction` (src/social/notifications-api.ts), which keeps only a path
 * inside the app — a web address never becomes a button.
 */
import { router } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { systemAction, type SystemNotice } from '@/social/notifications-api';

export function SystemNoticeCard(props: { notice: SystemNotice; onOpen?: (route: string) => void }): React.ReactElement {
  const n = props.notice;
  const at = new Date(n.createdAt);
  const action = systemAction(n.action);
  const open = props.onOpen ?? ((route: string) => router.push(route as never));
  return (
    <Box className="bg-surface border border-border rounded-row p-row gap-gap">
      <Text className="text-text text-body font-bold">{n.title}</Text>
      <Text className="text-muted text-xs">{at.toLocaleDateString([], { day: 'numeric', month: 'short' })} · {at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
      <Text className="text-text text-body leading-[22px]">{n.body}</Text>
      {action ? (
        <Pressable
          onPress={() => open(action.route)}
          accessibilityRole="link"
          accessibilityLabel={action.label}
          className="self-start rounded-pill bg-primary px-section items-center justify-center"
          style={{ minHeight: hit.min }}
        >
          <Text className="text-onPrimary text-body font-bold">{action.label}</Text>
        </Pressable>
      ) : null}
    </Box>
  );
}
