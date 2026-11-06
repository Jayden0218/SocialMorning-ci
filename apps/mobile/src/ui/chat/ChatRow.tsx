// The Chat tab's list: one card per conversation, the avatar at its left.
/**
 * Spec 039 (Feed lane, design B): the spine is gone. A conversation is ONE Feed card (raise, radius `radius.card`, padding `spacing.section`): the avatar (44) at the
 * left, then the name (Geist 600 15, flex 1) and the time (Geist Mono 11, text3), then the last message (14, text2) and, when there are unread, the count in a hot
 * pill (min 20 x 20, Geist Mono 11 / 600, void words). Unread: the name 700, the message in text colour at 600, and a 3 wide hot bar down the card's left edge.
 *
 * M31 T033 (design-pulse2 `chat--screen`; layout pattern Thread) drew them on a hot-violet-line spine at x 40; that spine and the avatar's void ring are retired.
 *
 * The row's Pressable lives in `app/(tabs)/chat.tsx` (its name and destination are the action
 * inventory's); these are the parts it is made of. `NameText` is a Text so the inventory reads the
 * person's name from the row, as it always has.
 */
import type { ReactNode } from 'react';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/kit/Text';
import { radius, spacing, typeScale, typeStyle } from '@/design';
import { Avatar } from '@/ui/kit/Avatar';
import { Type } from '@/ui/kit/Type';
import { drawnType } from '@/design/type-px';

/** The list's measures: the avatar 44, the unread bar 3 wide, the count pill 20. */
export const THREAD = { avatar: 44, accent: 3, pill: 20 } as const;

/** The person's circle: 44. */
export function ChatAvatar(props: { url?: string | null | undefined; name: string }): React.ReactElement {
  return (
    <Box testID="chat-avatar" className="rounded-pill items-center justify-center" style={{ width: THREAD.avatar, height: THREAD.avatar }}>
      <Avatar size={THREAD.avatar} url={props.url} name={props.name} />
    </Box>
  );
}

/** The person's name in the card: Geist 600 15 (700 unread). */
export function NameText(props: { children: ReactNode; unread: boolean }): React.ReactElement {
  return (
    <Text className={`${typeScale.row.cls} text-text flex-1 ${props.unread ? 'font-bold' : ''}`} style={{ ...typeStyle('row'), ...drawnType.chatName }} numberOfLines={1}>
      {props.children}
    </Text>
  );
}

/** The card: `avatar` at its left, `children` is the name; the time, the last message and the unread count are drawn round it. */
export function ChatCard(props: { unread: number; time: string; preview: string; avatar: ReactNode; children: ReactNode }): React.ReactElement {
  const unread = props.unread > 0;
  return (
    <Box testID="chat-card" className="flex-row items-center bg-raise overflow-hidden" style={{ borderRadius: radius.card, padding: spacing.section, gap: spacing.row }}>
      {unread ? <Box testID="chat-unread-bar" className="absolute bg-hot" style={{ left: 0, top: 0, bottom: 0, width: THREAD.accent }} accessible={false} /> : null}
      {props.avatar}
      <Box className="flex-1" style={{ minWidth: 0, gap: spacing.hair }}>
        <Box className="flex-row items-center" style={{ gap: spacing.gap }}>
          {props.children}
          <Type step="tag" className="text-text3">{props.time}</Type>
        </Box>
        <Box className="flex-row items-center" style={{ gap: spacing.gap }}>
          <Type step="note" className={unread ? 'flex-1 text-text font-semibold' : 'flex-1 text-text2'} style={drawnType.chatPreview} numberOfLines={1}>{props.preview}</Type>
          {unread ? (
            <Box testID="chat-unread-count" className="bg-hot items-center justify-center" style={{ minWidth: THREAD.pill, height: THREAD.pill, borderRadius: THREAD.pill / 2, paddingHorizontal: spacing.hair + 1 }}>
              <Type step="tag" className="text-void font-semibold">{props.unread > 99 ? '99+' : String(props.unread)}</Type>
            </Box>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}
