// Chat tab: your conversations on a spine, newest first, with unread counts; start a new chat.
/**
 * Chat (owner, 2026-10-04) — the third tab, at `/chat`. One row per person you have messaged:
 * their picture, their name, the last message (or "Shared an episode: …"), when, and how many
 * you have not read. "New chat" lists the people you can message — those who follow you back.
 *
 * M31 T033 (design-pulse2 `chat--screen`, `chat--signed-out`, `chat--empty`, `chat--error`; layout
 * pattern Thread): the conversations hang from a hot-violet-line spine (`ChatRow.tsx`), newest first;
 * the title bar is low (rule 1): "Chat", "People who follow you back" and a + (44) for New chat. Signed
 * out the page is an empty block with a light Sign in button and no +. With no chats yet the block
 * says so and the spine is not drawn; if they cannot be read, an error tile (radius 22) with Retry,
 * and the + stays. New chat, Sign in, Retry and opening a chat are the actions they were; "New chat ›"
 * moved into the title bar (m31/moves.json).
 *
 * Read on focus and every 15 s while the tab is open; there is no push channel for chat.
 */
import { useRouter, useFocusEffect, useScrollToTop } from 'expo-router';
import { useCallback, useState, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { SafeAreaView } from '@/ui/lib/safe-area-view';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { colour, gutter, radius, spacing } from '@/design';
import { Icon } from '@/ui/kit/Icon';
import { Loader } from '@/ui/kit/Loader';
import { Fade } from '@/ui/kit/Fade';
import { PulseButton } from '@/ui/kit/PulseButton';
import { TitleBar } from '@/ui/kit/TitleBar';
import { Type } from '@/ui/kit/Type';
import { chatTime } from '@/ui/chat/chat-time';
import { useSocial } from '@/social/context';
import { previewOf, useChatApi, type Conversation } from '@/social/chat-api';
import { plural } from '@socialmorning/social-core';
import { EndOfList } from '@/ui/kit/EndOfList';
import { ChatAvatar, ChatCard, NameText, Spine, THREAD } from '@/ui/chat/ChatRow';
import { EmptyBlock } from '@/ui/chat/EmptyBlock';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { tabTitleReserve, useTabTitleBottom } from '@/ui/me/useTabTitle';

const REFRESH_MS = 15_000;
/** The block of the empty and signed-out states sits 200 under the top of the page (drawn at 250 from the phone's top, 50 of it status bar). */
const BLOCK_TOP = 200;
/** The error tile: radius 22, padding 16, 12 between its parts; left 28 (the lane), right 16. */
const TILE = { borderRadius: radius.artworkLarge, padding: spacing.section, gap: spacing.row };
/** The error tile is drawn 70 under the empty block's top (120 from the phone's top). */
const ERROR_TOP = 70;
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: Conversation[] };

export default function ChatTab(): React.ReactElement {
  const top = useRef(null); useScrollToTop(top); // M21 T082: pressing this tab again scrolls to the top.
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { listener } = useSocial();
  const chat = useChatApi();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const titleBottom = useTabTitleBottom();

  useFocusEffect(useCallback(() => {
    if (!listener) return undefined;
    let live = true;
    const load = () => void chat.conversations().then(
      (items) => { if (live) setState({ kind: 'ok', items }); },
      () => { if (live) setState((s) => (s.kind === 'ok' ? s : { kind: 'error' })); },
    );
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { live = false; clearInterval(timer); };
  }, [chat, listener]));

  const retry = () => {
    setState({ kind: 'loading' });
    chat.conversations().then((items) => setState({ kind: 'ok', items }), () => setState({ kind: 'error' }));
  };

  if (!listener) {
    return (
      <SafeAreaView className="flex-1 bg-void">
        <Box style={{ paddingTop: BLOCK_TOP }}>
          <EmptyBlock title="Chat" line="Sign in to chat with people who follow you back">
            <PulseButton label="Sign in" accessibilityLabel="Sign in" onPress={() => router.push('/auth/sign-in')} />
          </EmptyBlock>
        </Box>
        <Fade bottom={0} height={300} />
        <TitleBar title="Chat" bottom={titleBottom} />
      </SafeAreaView>
    );
  }

  const now = Date.now();
  const items = state.kind === 'ok' ? state.items : [];
  return (
    <SafeAreaView className="flex-1 bg-void">
      <ScrollView ref={top} contentContainerStyle={{ flexGrow: 1 }}>
        {items.length > 0 ? (
          <Box style={{ marginTop: THREAD.lift, paddingTop: THREAD.top, paddingLeft: THREAD.left, paddingRight: THREAD.right, paddingBottom: tabTitleReserve(titleBottom) }}>
            <Spine />
            <Box style={{ gap: THREAD.rowGap }}>
              {items.map((item) => {
                const unread = item.unread > 0;
                const preview = previewOf(item.last);
                return (
                  <Pressable
                    key={item.with.id}
                    onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.with.id, name: item.with.displayName } })}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.with.displayName}${unread ? `, ${plural(item.unread, 'unread message')}` : ''}. ${preview}`}
                    className="flex-row items-center"
                    style={{ gap: spacing.row }}
                  >
                    <ChatAvatar url={item.with.avatarUrl} name={item.with.displayName} />
                    <ChatCard unread={item.unread} time={chatTime(item.last.createdAt, now)} preview={preview}>
                      <NameText unread={unread}>{item.with.displayName}</NameText>
                    </ChatCard>
                  </Pressable>
                );
              })}
              {/* Owner, 2026-10-05: the bottom of a fetched list says so. */}
              <EndOfList />
            </Box>
          </Box>
        ) : state.kind === 'loading' ? <Loader className="my-section" /> : state.kind === 'error' ? (
          <Box style={{ paddingTop: ERROR_TOP, marginLeft: ME_MOSAIC.lane, marginRight: gutter(width) - spacing.hair }}>
            <Box testID="chat-error" className="bg-raise border border-line" style={TILE} accessibilityLiveRegion="polite">
              <Box className="flex-row items-start" style={{ gap: spacing.gap + 2 }}>
                <Icon name="alert-circle-outline" size={22} color={colour.warn} />
                <Type step="body" className="text-text font-medium flex-1">Couldn't load your chats right now.</Type>
              </Box>
              <Pressable onPress={retry} accessibilityRole="button" accessibilityLabel="Retry" hitSlop={spacing.hair} className="self-start flex-row items-center bg-raise border border-line rounded-pill" style={{ height: 40, paddingHorizontal: spacing.block - 2, gap: spacing.gap - 2 }}>
                <Icon name="repeat-outline" size={16} color={colour.text} />
                <Type step="row" className="text-text">Retry</Type>
              </Pressable>
            </Box>
          </Box>
        ) : (
          <Box style={{ paddingTop: BLOCK_TOP }}>
            <EmptyBlock title="No chats yet." line="Tap New chat to message someone who follows you back." />
          </Box>
        )}
      </ScrollView>
      <Fade bottom={0} height={300} />
      <TitleBar
        title="Chat"
        subtitle="People who follow you back"
        actions={[{ icon: 'add', label: 'New chat', onPress: () => router.push('/chat/new') }]}
        bottom={titleBottom}
      />
    </SafeAreaView>
  );
}
