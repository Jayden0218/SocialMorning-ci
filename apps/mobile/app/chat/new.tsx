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
 */
import { useLoad } from '@/ui/kit/useLoad';
import { router, useLocalSearchParams } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Box } from '@/ui/lib/box';
import { gutter } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Avatar } from '@/ui/kit/Avatar';
import { EdgeLabel } from '@/ui/kit/EdgeLabel';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Type } from '@/ui/kit/Type';
import { EndOfList } from '@/ui/kit/EndOfList';
import { drawnType } from '@/design/type-px';
import { CenterAt, ErrBlock, SignInBlock } from '@/ui/chat/blocks';
import { CHAT } from '@/ui/chat/measures';
import { PageEmpty, mosaicColumn } from '@/ui/me/lists';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { GhostRows } from '@/ui/comments/Spine';
import { useStores } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { useChatApi, type ChatPerson } from '@/social/chat-api';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; friends: ChatPerson[] };

export default function NewChat(): React.ReactElement {
  const params = useLocalSearchParams<{ episodeId?: string; episodeTitle?: string; text?: string }>();
  const { listener } = useSocial();
  const chat = useChatApi();
  const stores = useStores();
  const { width } = useWindowDimensions();
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

  return (
    <PushedPage title={title} subtitle={subtitle}>
      {(layout) => {
        const top = layout.top + (sharingEpisode ? CHAT.gridTopSending : CHAT.gridTop) - 50;
        if (!listener) {
          return (
            <CenterAt top={240}>
              <SignInBlock line="Sign in to chat with people who follow you back">
                <PulseButton label="Sign in" accessibilityLabel="Sign in" onPress={() => router.push('/auth/sign-in')} full />
              </SignInBlock>
            </CenterAt>
          );
        }
        if (state.kind === 'error') {
          return (
            <CenterAt top={260}>
              <ErrBlock line="Couldn't load this right now.">
                <PulseButton label="Retry" accessibilityLabel="Retry" onPress={load} />
              </ErrBlock>
            </CenterAt>
          );
        }
        const column = mosaicColumn(width);
        const friends = state.kind === 'ok' ? state.friends : [];
        return (
          <>
            {sharingEpisode ? (
              <Box
                className="absolute flex-row items-center bg-raise"
                style={{ left: gutter(width), right: gutter(width), top: layout.top + 58 - 50, borderRadius: CHAT.sharingRadius, padding: CHAT.sharingPad, gap: CHAT.sharingGap, zIndex: 4 }}
                testID="sharing-card"
                accessible
                accessibilityLabel={`Sharing ${String(params.episodeTitle ?? '')}`}
              >
                <Artwork url={episodeImage ?? null} size={CHAT.sharingCover} name={String(params.episodeTitle ?? '')} />
                <Box className="flex-1 min-w-0">
                  <Type step="tag" className="text-hotText">SHARING</Type>
                  <Type step="lede" className="text-text" style={[drawnType.unbounded[15], { marginTop: 4 }]} numberOfLines={2}>{String(params.episodeTitle ?? '')}</Type>
                </Box>
              </Box>
            ) : null}
            <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: top, paddingBottom: layout.reserve, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
              {state.kind === 'loading' ? (
                <Box testID="new-chat-loading" style={{ marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right }}><GhostRows rows={6} /></Box>
              ) : friends.length === 0 ? (
                <PageEmpty top={120} title="Nobody follows you back yet." line="Chat opens when you both follow each other." />
              ) : (
                <Box>
                  {sharing ? null : <EdgeLabel label="Follow you back" top={CHAT.tileGap} />}
                  <Box className="flex-row flex-wrap" style={{ marginLeft: ME_MOSAIC.lane, marginRight: ME_MOSAIC.right, gap: ME_MOSAIC.gap }} testID="chat-tiles">
                    {friends.map((item) => (
                      <Pressable
                        key={item.id}
                        onPress={() => pick(item)}
                        accessibilityRole="button"
                        accessibilityLabel={sharing ? `Send to ${item.displayName}` : `Chat with ${item.displayName}`}
                        className="bg-raise justify-center"
                        style={{ width: column, minHeight: ME_MOSAIC.row, borderRadius: ME_MOSAIC.radius, padding: ME_MOSAIC.pad }}
                      >
                        <Box className="flex-row items-center" style={{ gap: CHAT.tileGap }}>
                          <Avatar size={CHAT.tileAvatar} url={item.avatarUrl} name={item.displayName} />
                          <Box className="flex-1 min-w-0">
                            <Type step="compact" className="text-text" numberOfLines={1}>{item.displayName}</Type>
                            {sharing ? null : <Type step="badge" className="text-text3" numberOfLines={1}>follows you back</Type>}
                          </Box>
                        </Box>
                        {sharing ? (
                          <Box className="absolute bg-hot items-center justify-center" style={{ right: CHAT.tileGap, bottom: CHAT.tileGap, height: CHAT.sendChip.height, paddingHorizontal: CHAT.sendChip.padX, borderRadius: CHAT.sendChip.height / 2 }} accessible={false} importantForAccessibility="no-hide-descendants">
                            <Type step="chip" className="text-void font-bold">Send</Type>
                          </Box>
                        ) : null}
                      </Pressable>
                    ))}
                  </Box>
                  <EndOfList />
                </Box>
              )}
            </ScrollView>
          </>
        );
      }}
    </PushedPage>
  );
}
