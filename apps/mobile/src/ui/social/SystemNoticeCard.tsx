// One message from SocialNet: title, text, time, and at most one button that opens a page in the app.
/**
 * M21 US10 (T108): a system card may carry one in-app button. Its route comes from the notice's
 * payload through `systemAction` (src/social/notifications-api.ts), which keeps only a path
 * inside the app — a web address never becomes a button.
 *
 * M31 W4-C (T052; design-pulse2 `social.html#notifications-system--screen`): a raise card (radius 18, padding 14, 8 between parts): a 28
 * icon square (radius 9, raise2) with the bell and the title in Geist 600 15, the date and time in mono 11, the words in Geist 15 / 22,
 * and the notice's action as a light 40 pill. Not as drawn: every notice wears the bell (the drawing's second card wears an "i"; a
 * notice carries no kind here).
 */
import { router } from 'expo-router';
import { Box } from '@/ui/lib/box';
import { colour } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { NOTIF, NotifCard } from '@/ui/notifications/parts';
import { systemAction, type SystemNotice } from '@/social/notifications-api';

export function SystemNoticeCard(props: { notice: SystemNotice; onOpen?: (route: string) => void }): React.ReactElement {
  const n = props.notice;
  const at = new Date(n.createdAt);
  const action = systemAction(n.action);
  const open = props.onOpen ?? ((route: string) => router.push(route as never));
  return (
    <NotifCard testID="system-card" pad={NOTIF.systemPad} gap={NOTIF.systemGap}>
      <Box className="flex-row items-center" style={{ gap: 8 }}>
        <Box className="bg-raise2 items-center justify-center" style={{ width: NOTIF.square, height: NOTIF.square, borderRadius: NOTIF.squareRadius }} accessible={false} importantForAccessibility="no-hide-descendants">
          <Icon name="notifications-outline" size={16} color={colour.text} />
        </Box>
        <Type step="row" className="text-text flex-1">{n.title}</Type>
      </Box>
      <Type step="tag" className="text-text3">{`${at.toLocaleDateString([], { day: 'numeric', month: 'short' })} · ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</Type>
      <Type step="body" className="text-text">{n.body}</Type>
      {action ? <PulseButton label={action.label} onPress={() => open(action.route)} height={40} className="self-start" /> : null}
    </NotifCard>
  );
}
