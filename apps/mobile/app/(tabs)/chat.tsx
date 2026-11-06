// Chat tab: your conversations as cards, newest first, with unread counts; start a new chat.
/**
 * Chat (owner, 2026-10-04) — the third tab, at `/chat`. One row per person you have messaged:
 * their picture, their name, the last message (or "Shared an episode: …"), when, and how many
 * you have not read. "New chat" lists the people you can message — those who follow you back.
 *
 * Before spec 039 (the page as M31 drew it, with a spine; the Spec 039 paragraph below is what the page is now) — M31 T033 (design-pulse2 `chat--screen`, `chat--signed-out`, `chat--empty`, `chat--error`; layout
 * pattern Thread): the conversations hang from a hot-line spine (`ChatRow.tsx`), newest first;
 * the title bar is low (rule 1): "Chat", "People who follow you back" and a + (44) for New chat. Signed
 * out the page is an empty block with a light Sign in button and no +. With no chats yet the block
 * says so and the spine is not drawn; if they cannot be read, an error tile (radius 22) with Retry,
 * and the + stays. New chat, Sign in, Retry and opening a chat are the actions they were; "New chat ›"
 * moved into the title bar (m31/moves.json).
 *
 * Spec 039 (Feed lane, design B): a `FeedPage` in a tab (no Back; the + for New chat after the title; the foot clears the tab bar); each conversation is ONE card
 * (avatar, name and time, the last message, the unread pill), no spine; signed out and none yet are empty blocks; a failed read is an `InlineNotice` with Retry.
 *
 * Read on focus and every 15 s while the tab is open; there is no push channel for chat.
 */
import { useRouter, useFocusEffect, useScrollToTop } from 'expo-router';
import { useCallback, useState, useRef, type ComponentProps } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Loader } from '@/ui/kit/Loader';
import { PulseButton } from '@/ui/kit/PulseButton';
import { InlineNotice } from '@/ui/kit/layout';
import { FeedPage } from '@/ui/feed/FeedPage';
import { chatTime } from '@/ui/chat/chat-time';
import { useSocial } from '@/social/context';
import { previewOf, useChatApi, type Conversation } from '@/social/chat-api';
import { plural } from '@socialmorning/social-core';
import { EndOfList } from '@/ui/kit/EndOfList';
import { ChatAvatar, ChatCard, NameText } from '@/ui/chat/ChatRow';
import { EmptyBlock } from '@/ui/chat/EmptyBlock';
import { spacing } from '@/design';
import { nowMs as clockMs } from '@/ui/kit/clock';

const REFRESH_MS = 15_000;
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: Conversation[] };
type Lister = NonNullable<ComponentProps<typeof FeedPage<Conversation>>['scrollRef']>;

export default function ChatTab(): React.ReactElement {
  const list = useRef<Lister['current']>(null);
  useScrollToTop(list as never); // M21 T082: pressing this tab again scrolls to the top.
  const router = useRouter();
  const { listener } = useSocial();
  const chat = useChatApi();
  const [state, setState] = useState<State>({ kind: 'loading' });

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

  const now = clockMs();
  const items = listener && state.kind === 'ok' ? state.items : [];
  return (
    <FeedPage<Conversation>
      title="Chat"
      {...(listener ? { subtitle: 'People who follow you back', actions: [{ icon: 'add' as const, label: 'New chat', onPress: () => router.push('/chat/new') }] } : {})}
      onBack={null}
      tabs
      scrollRef={list}
      data={items}
      keyExtractor={(c) => c.with.id}
      contentStyle={{ flexGrow: 1 }}
      gap={spacing.row}
      ListHeaderComponent={listener && state.kind === 'error' ? <InlineNotice text="Couldn't load your chats right now." actionLabel="Retry" onAction={retry} /> : null}
      ListEmptyComponent={
        !listener ? (
          <EmptyBlock title="Chat" line="Sign in to chat with people who follow you back">
            <PulseButton label="Sign in" accessibilityLabel="Sign in" onPress={() => router.push('/auth/sign-in')} />
          </EmptyBlock>
        ) : state.kind === 'loading' ? <Loader className="my-section" />
        : state.kind === 'error' ? undefined
        : <EmptyBlock title="No chats yet." line="Tap New chat to message someone who follows you back." />
      }
      // Owner, 2026-10-05: the bottom of a fetched list says so.
      ListFooterComponent={items.length > 0 ? <EndOfList /> : undefined}
      renderItem={({ item }) => {
        const unread = item.unread > 0;
        const preview = previewOf(item.last);
        return (
          <Pressable
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.with.id, name: item.with.displayName } })}
            accessibilityRole="button"
            accessibilityLabel={`${item.with.displayName}${unread ? `, ${plural(item.unread, 'unread message')}` : ''}. ${preview}`}
          >
            <ChatCard unread={item.unread} time={chatTime(item.last.createdAt, now)} preview={preview} avatar={<ChatAvatar url={item.with.avatarUrl} name={item.with.displayName} />}>
              <NameText unread={unread}>{item.with.displayName}</NameText>
            </ChatCard>
          </Pressable>
        );
      }}
    />
  );
}
