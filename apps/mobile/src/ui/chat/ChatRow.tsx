// The Chat tab's thread: conversations hang from a spine; each is an avatar on the spine and a card.
/**
 * M31 T033 (design-pulse2 `chat--screen`; layout pattern Thread). Conversations hang from a 2 wide
 * spine at x 40 that runs hot -> violet (50 %) -> line, newest first. A row is the avatar (44, with a
 * 3 void ring so it sits cleanly on the spine) and a card (radius 18, raise fill, padding 12 / 14,
 * 4 between lines): the name (Geist 600 15, flex 1) and the time (Geist Mono 11, text3), then the
 * last message (14, text2) and, when there are unread, the count in a hot pill (min 20 x 20, Geist
 * Mono 11 / 600, void words). Unread: the name 700, the message in text colour at 600, and a 3 wide
 * hot bar down the card's left edge.
 *
 * The row's Pressable lives in `app/(tabs)/chat.tsx` (its name and destination are the action
 * inventory's); these are the parts it is made of. `NameText` is a Text so the inventory reads the
 * person's name from the row, as it always has.
 */
import type { ReactNode } from 'react';
import { Box } from '@/ui/lib/box';
import { Text } from '@/ui/kit/Text';
import { LinearGradient } from '@/design/tailwind';
import { colour, radius, spacing, typeScale, typeStyle } from '@/design';
import { Avatar } from '@/ui/kit/Avatar';
import { Type } from '@/ui/kit/Type';
import { drawnType } from '@/design/type-px';

/** The thread's measures: the list is 18 from the left, 16 from the right, 8 under the spine's top, which sits 14 under the status bar (drawn: the scroll starts at 64). */
export const THREAD = { left: 18, right: 16, top: 8, lift: 14, rowGap: 14, avatar: 44, ring: 3, spineLeft: 40, spineWidth: 2, accent: 3, cardPadY: 12, cardPadX: 14, pill: 20 } as const;
const SPINE = [colour.hot, colour.violet, colour.line] as const;
const SPINE_AT = [0, 0.5, 1] as const;

/** The spine: absolute, full height of the thread, behind the avatars. */
export function Spine(): React.ReactElement {
  return (
    <LinearGradient
      testID="chat-spine"
      colors={SPINE}
      locations={SPINE_AT}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: THREAD.spineLeft, top: 0, bottom: 0, width: THREAD.spineWidth }}
    />
  );
}

/** The person's circle on the spine: 44 over a 3 void ring, the picture inside is 38. */
export function ChatAvatar(props: { url?: string | null | undefined; name: string }): React.ReactElement {
  return (
    <Box testID="chat-avatar" className="rounded-pill bg-void items-center justify-center" style={{ width: THREAD.avatar, height: THREAD.avatar, zIndex: 2 }}>
      <Avatar size={THREAD.avatar - 2 * THREAD.ring} url={props.url} name={props.name} />
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

/** The card: `children` is the name; the time, the last message and the unread count are drawn round it. */
export function ChatCard(props: { unread: number; time: string; preview: string; children: ReactNode }): React.ReactElement {
  const unread = props.unread > 0;
  return (
    <Box testID="chat-card" className="flex-1 bg-raise overflow-hidden" style={{ minWidth: 0, borderRadius: radius.bar, paddingVertical: THREAD.cardPadY, paddingHorizontal: THREAD.cardPadX, gap: spacing.hair }}>
      {unread ? <Box testID="chat-unread-bar" className="absolute bg-hot" style={{ left: 0, top: 0, bottom: 0, width: THREAD.accent }} accessible={false} /> : null}
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
  );
}

