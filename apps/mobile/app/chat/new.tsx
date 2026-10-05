// Pick who to chat with: the people who follow you back; can carry an episode to send.
/**
 * New chat (owner, 2026-10-04) at `/chat/new`: the people you follow who also follow you, by
 * name. Tap one to open the conversation. From Share → "Send in chat" the page carries
 * `episodeId` and `episodeTitle`, says "Send to", and hands the episode to the conversation,
 * where it waits above the message box until it is sent. Owner, 2026-10-05: a show's Share carries
 * `text` (its name and link) instead, which waits in the message box.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Loader } from '@/ui/kit/Loader';
import { PageHeader } from '@/ui/kit/PageHeader';
import { EmptyPicture } from '@/ui/me/parts';
import { useSocial } from '@/social/context';
import { useChatApi, type ChatPerson } from '@/social/chat-api';
import { EndOfList } from '@/ui/kit/EndOfList';

const TAP = { minHeight: hit.min };
type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; friends: ChatPerson[] };

export default function NewChat(): React.ReactElement {
  const params = useLocalSearchParams<{ episodeId?: string; episodeTitle?: string; text?: string }>();
  const { listener } = useSocial();
  const chat = useChatApi();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(() => {
    if (!listener) return;
    setState({ kind: 'loading' });
    chat.friends().then((friends) => setState({ kind: 'ok', friends }), () => setState({ kind: 'error' }));
  }, [chat, listener]);
  useEffect(() => { load(); }, [load]);

  const sharingEpisode = params.episodeId !== undefined && params.episodeId !== '';
  const sharingText = params.text !== undefined && params.text !== '';
  const sharing = sharingEpisode || sharingText;
  const header = <PageHeader title={sharing ? 'Send to' : 'New chat'} {...(sharingEpisode ? { subtitle: String(params.episodeTitle ?? '') } : {})} />;
  if (!listener) {
    return (
      <>
        {header}
        <Box className="flex-1 bg-background items-center gap-row">
          <EmptyPicture icon="chatbubbles-outline" line="Sign in to chat with people who follow you back" />
          <Pressable onPress={() => router.push('/auth/sign-in')} accessibilityRole="button" accessibilityLabel="Sign in" className="bg-primary rounded-pill px-section justify-center mb-24" style={TAP}>
            <Text className="text-onPrimary text-body font-bold">Sign in</Text>
          </Pressable>
        </Box>
      </>
    );
  }

  const pick = (p: ChatPerson) => {
    router.replace({
      pathname: '/chat/[id]',
      params: { id: p.id, name: p.displayName, ...(sharingEpisode ? { episodeId: String(params.episodeId), episodeTitle: String(params.episodeTitle ?? '') } : {}), ...(sharingText ? { text: String(params.text) } : {}) },
    });
  };

  return (
    <>
      {header}
      <FlatList
        className="flex-1 bg-background"
        data={state.kind === 'ok' ? state.friends : []}
        // Owner, 2026-10-05: the bottom of a fetched list says so.
        ListFooterComponent={state.kind === 'ok' && state.friends.length > 0 ? <EndOfList /> : null}
        keyExtractor={(p) => p.id}
        contentContainerClassName="pb-24 flex-grow"
        ListHeaderComponent={<Text className="text-muted text-meta px-screen-x pb-row">People who follow you back</Text>}
        ListEmptyComponent={state.kind === 'loading' ? <Loader className="my-section" /> : state.kind === 'error' ? (
          <Box className="items-center my-section">
            <Text className="text-muted text-sm">Couldn't load this right now.</Text>
            <Pressable onPress={load} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center" style={TAP}><Text className="text-accent text-sm font-semibold">Retry</Text></Pressable>
          </Box>
        ) : <EmptyPicture icon="people-outline" line="Nobody follows you back yet. Chat opens when you both follow each other." />}
        renderItem={({ item }) => (
          <Pressable onPress={() => pick(item)} accessibilityRole="button" accessibilityLabel={sharing ? `Send to ${item.displayName}` : `Chat with ${item.displayName}`} className="flex-row items-center gap-row px-screen-x py-2" style={TAP}>
            <Artwork size={44} rounded="pill" name={item.displayName} />
            <Text className="flex-1 text-text text-body font-bold" numberOfLines={1}>{item.displayName}</Text>
          </Pressable>
        )}
      />
    </>
  );
}
