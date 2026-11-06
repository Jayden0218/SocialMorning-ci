// Pick who to chat with: the people who follow you back; can carry an episode to send.
/**
 * New chat (owner, 2026-10-04) at `/chat/new`: the people you follow who also follow you, by
 * name. Tap one to open the conversation. From Share → "Send in chat" the page carries
 * `episodeId` and `episodeTitle`, says "Send to", and hands the episode to the conversation,
 * where it waits above the message box until it is sent. Owner, 2026-10-05: a show's Share carries
 * `text` (its name and link) instead, which waits in the message box.
 *
 * M31 W4-C (T052; design-pulse2 `social.html#chat-new--screen`, `--signed-out`, `--send-to`, `--load-failed`; layout pattern Mosaic): the
 * people are 1 x 1 tiles (two columns in the 28 / 16 lane, rows 84, 10 apart, radius 22): a 36 avatar, the name (Geist 600 14) and
 * "follows you back" in mono 10, under the edge label "Follow you back". Sending an episode, the episode sits on a raise card at
 * the top ("SHARING", cover 56) and each tile carries a hot "Send" chip instead of the line. The title bar is low: "New chat" /
 * "People who follow you back", or "Send to" / the episode's title. Loading is ghost tiles; the end says "No more to fetch".
 *
 * Spec 039 (Feed lane, design B): a `FeedPage`; a person is ONE card (36 avatar, the name, "follows you back"; a hot "Send" chip when sharing) in a list; the "SHARING"
 * card sits under the title; a failed load is an `InlineNotice` with Retry; signed out is the sign-in block. No edge label, no two-column lane.
 */
import { useLoad } from '@/ui/kit/useLoad';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { spacing } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Avatar } from '@/ui/kit/Avatar';
import { PulseButton } from '@/ui/kit/PulseButton';
import { InlineNotice } from '@/ui/kit/layout';
import { FeedEmpty, FeedLoading, FeedPage } from '@/ui/feed/FeedPage';
import { ItemCard } from '@/ui/notifications/cards';
import { Type } from '@/ui/kit/Type';
import { EndOfList } from '@/ui/kit/EndOfList';
import { drawnType } from '@/design/type-px';
import { SignInBlock } from '@/ui/chat/blocks';
import { CHAT } from '@/ui/chat/measures';
import { useStores } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { useChatApi, type ChatPerson } from '@/social/chat-api';


export default function NewChat(): React.ReactElement {
  const params = useLocalSearchParams<{ episodeId?: string; episodeTitle?: string; text?: string }>();
  const { listener } = useSocial();
  const chat = useChatApi();
  const stores = useStores();
  // M23 US9: cancelled on unmount; only the newest answer lands.
  const [state, load] = useLoad(listener ? () => chat.friends().then((friends) => ({ friends })) : undefined, [chat, listener], 'chat.friends');

  const sharingEpisode = params.episodeId !== undefined && params.episodeId !== '';
  const sharingText = params.text !== undefined && params.text !== '';
  const sharing = sharingEpisode || sharingText;
  const title = sharing ? 'Send to' : 'New chat';
  const subtitle = sharingEpisode ? String(params.episodeTitle ?? '') : 'People who follow you back';
  const episodeImage = sharingEpisode ? stores.feeds.getEpisode(String(params.episodeId))?.imageUrl : undefined;

  const pick = (p: ChatPerson) => {
    router.replace({
      pathname: '/chat/[id]',
      params: { id: p.id, name: p.displayName, ...(sharingEpisode ? { episodeId: String(params.episodeId), episodeTitle: String(params.episodeTitle ?? '') } : {}), ...(sharingText ? { text: String(params.text) } : {}) },
    });
  };

  const friends = listener && state.kind === 'ok' ? state.friends : [];
  const sharingCard = sharingEpisode ? (
    <Box
      className="flex-row items-center bg-raise"
      style={{ borderRadius: CHAT.sharingRadius, padding: CHAT.sharingPad, gap: CHAT.sharingGap }}
      testID="sharing-card"
      accessible
      accessibilityLabel={`Sharing ${String(params.episodeTitle ?? '')}`}
    >
      <Artwork url={episodeImage ?? null} size={CHAT.sharingCover} name={String(params.episodeTitle ?? '')} />
      <Box className="flex-1 min-w-0">
        <Type step="tag" className="text-hotText">SHARING</Type>
        <Type step="lede" className="text-text" style={[drawnType.unbounded[15], { marginTop: spacing.hair }]} numberOfLines={2}>{String(params.episodeTitle ?? '')}</Type>
      </Box>
    </Box>
  ) : null;

  return (
    <FeedPage<ChatPerson>
      title={title}
      subtitle={subtitle}
      data={friends}
      keyExtractor={(p) => p.id}
      keyboardShouldPersistTaps="handled"
      contentStyle={{ flexGrow: 1 }}
      gap={spacing.row}
      header={listener ? sharingCard : null}
      ListHeaderComponent={listener && state.kind === 'error' ? <InlineNotice text="Couldn't load this right now." actionLabel="Retry" onAction={load} /> : null}
      ListEmptyComponent={
        !listener ? (
          <SignInBlock line="Sign in to chat with people who follow you back">
            <PulseButton label="Sign in" accessibilityLabel="Sign in" onPress={() => router.push('/auth/sign-in')} full />
          </SignInBlock>
        ) : state.kind === 'loading' ? <FeedLoading testID="new-chat-loading" rows={6} />
        : state.kind === 'error' ? undefined
        : <FeedEmpty title="Nobody follows you back yet." line="Chat opens when you both follow each other." />
      }
      ListFooterComponent={friends.length > 0 ? <EndOfList /> : undefined}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => pick(item)}
          accessibilityRole="button"
          accessibilityLabel={sharing ? `Send to ${item.displayName}` : `Chat with ${item.displayName}`}
        >
          <ItemCard testID="chat-person">
            <Box className="flex-row items-center" style={{ gap: CHAT.tileGap }}>
              <Avatar size={CHAT.tileAvatar} url={item.avatarUrl} name={item.displayName} />
              <Box className="flex-1 min-w-0">
                <Type step="compact" className="text-text" numberOfLines={1}>{item.displayName}</Type>
                {sharing ? null : <Type step="badge" className="text-text3" numberOfLines={1}>follows you back</Type>}
              </Box>
              {sharing ? (
                <Box className="bg-hot items-center justify-center" style={{ height: CHAT.sendChip.height, paddingHorizontal: CHAT.sendChip.padX, borderRadius: CHAT.sendChip.height / 2 }} accessible={false} importantForAccessibility="no-hide-descendants">
                  <Type step="chip" className="text-void font-bold">Send</Type>
                </Box>
              ) : null}
            </Box>
          </ItemCard>
        </Pressable>
      )}
    />
  );
}
