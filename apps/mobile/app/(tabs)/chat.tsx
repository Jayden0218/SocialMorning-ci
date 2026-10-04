// Chat tab: your conversations, newest first, with unread counts; start a new chat.
/**
 * Chat (owner, 2026-10-04) — the third tab, at `/chat`. One row per person you have messaged:
 * their initial, their name, the last message (or "Shared an episode: …"), when, and how many
 * you have not read. "New chat" lists the people you can message — those who follow you back.
 *
 * Read on focus and every 15 s while the tab is open; there is no push channel for chat.
 * Signed out, the tab says what it is for and links to sign in.
 */
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { SafeAreaView } from '@/ui/lib/safe-area-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { Loader } from '@/ui/kit/Loader';
import { BOTTOM_INSET } from '@/ui/kit/Screen';
import { useColours } from '@/ui/kit/useColours';
import { EmptyPicture } from '@/ui/me/parts';
import { useStores } from '@/ui/shell/providers';
import { ago } from '@/discover/sections';
import { useSocial } from '@/social/context';
import { previewOf, useChatApi, type Conversation } from '@/social/chat-api';
import { plural } from '@socialmorning/social-core';

const TAP = { minHeight: hit.min };
const REFRESH_MS = 15_000;
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: Conversation[] };

export default function ChatTab(): React.ReactElement {
  const router = useRouter();
  const stores = useStores();
  const c = useColours(stores.settings);
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

  const header = (
    <Box className="px-screen-x pt-section pb-row">
      <Text className="font-display text-display text-text" accessibilityRole="header">Chat</Text>
      {listener ? (
        <Link href="/chat/new" asChild>
          <Pressable accessibilityRole="link" accessibilityLabel="New chat" className="self-start flex-row items-center gap-2" style={TAP}>
            <Icon name="create-outline" size={16} color={c.accent} />
            <Text className="text-accent text-meta font-semibold">New chat →</Text>
          </Pressable>
        </Link>
      ) : null}
    </Box>
  );

  if (!listener) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        {header}
        <EmptyPicture icon="chatbubbles-outline" line="Sign in to chat with people who follow you back" />
        <Pressable onPress={() => router.push('/auth/sign-in')} accessibilityRole="button" accessibilityLabel="Sign in" className="self-center bg-primary rounded-pill px-section justify-center mb-24" style={TAP}>
          <Text className="text-onPrimary text-body font-bold">Sign in</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const now = Date.now();
  const items = state.kind === 'ok' ? state.items : [];
  return (
    <SafeAreaView className="flex-1 bg-background">
      <FlatList
        data={items}
        keyExtractor={(i) => i.with.id}
        contentContainerStyle={{ paddingBottom: BOTTOM_INSET }}
        contentContainerClassName="flex-grow"
        ListHeaderComponent={header}
        ListEmptyComponent={state.kind === 'loading' ? <Loader className="my-section" /> : state.kind === 'error' ? (
          <Box className="items-center my-section">
            <Text className="text-muted text-sm">Couldn't load your chats right now.</Text>
            <Pressable onPress={retry} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center" style={TAP}><Text className="text-accent text-sm font-semibold">Retry</Text></Pressable>
          </Box>
        ) : <EmptyPicture icon="chatbubbles-outline" line="No chats yet. Tap New chat to message someone who follows you back." />}
        renderItem={({ item }) => {
          const unread = item.unread > 0;
          const preview = previewOf(item.last);
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.with.id, name: item.with.displayName } })}
              accessibilityRole="button"
              accessibilityLabel={`${item.with.displayName}${unread ? `, ${plural(item.unread, 'unread message')}` : ''}. ${preview}`}
              className="flex-row items-center gap-row px-screen-x py-row"
              style={TAP}
            >
              <Artwork size={48} rounded="pill" name={item.with.displayName} />
              <Box className="flex-1">
                <Box className="flex-row items-center gap-2">
                  <Text className="flex-1 text-text text-body font-bold" numberOfLines={1}>{item.with.displayName}</Text>
                  <Text className="text-muted text-xs">{ago(item.last.createdAt, now)}</Text>
                </Box>
                <Box className="flex-row items-center gap-2 mt-0.5">
                  <Text className={unread ? 'flex-1 text-text text-sm font-semibold' : 'flex-1 text-muted text-sm'} numberOfLines={1}>{preview}</Text>
                  {unread ? (
                    <Box className="min-w-5 px-1.5 rounded-pill bg-accent items-center">
                      <Text className="text-background text-xs font-bold">{item.unread}</Text>
                    </Box>
                  ) : null}
                </Box>
              </Box>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}
