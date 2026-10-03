/**
 * A clip link opened on this phone (M4 US1, FR-003/FR-004). Both link forms land here
 * (expo-router: `socialmorning://clip/<id>` and the verified https link). Works signed
 * out: clips are public. Resolution order in `src/graph/resolve.ts`.
 *
 * M17 (`Clip-B`): the clip sits in one centred card (`ClipCard variant="hero"`: eyebrow,
 * serif episode, serif quote, range pill, author), and the actions moved to a bar at the
 * foot — Keep listening / Play the episode (yellow pill), Open player (outlined pill) and
 * Share as a round icon button. Same conditions, names and handlers as before.
 */
import { useEffect, useState } from 'react';
import { Share } from 'react-native';
import { Pressable } from '../../src/ui/lib/pressable';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { ScrollView } from '../../src/ui/lib/scroll-view';
import { router, useLocalSearchParams } from 'expo-router';
import { useSocial } from '../../src/social/context';
import { useStores } from '../../src/ui/providers';
import { usePlayer, usePlayerState } from '../../src/playback/store';
import { refreshShow } from '../../src/feeds/fetch';
import { resolveClipEpisode, type Resolved } from '../../src/graph/resolve';
import { ClipCard } from '../../src/ui/ClipCard';
import { shareClip } from '../../src/graph/share';
import { useSharePanel } from '../../src/ui/ShareChooser';
import { PageHeader } from '../../src/ui/PageHeader';
import { Icon } from '../../src/ui/Icon';
import { useColours } from '../../src/ui/useColours';
import { hit } from '../../src/design';
import { apiBaseUrl } from '../../src/social/base-url';
import { ApiError, type Clip } from '../../src/social/api';

type Status = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; clip: Clip; resolved: Resolved };

const TAP = { minHeight: hit.min };
const ROUND = { width: hit.min, height: hit.min };

export default function ClipScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, listener } = useSocial();
  const stores = useStores();
  const c = useColours(stores.settings);
  const player = usePlayer();
  const state = usePlayerState();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  // M16a T005 (FR-015): the app's share panel first; the system sheet behind "More".
  const [share, sharePanel] = useSharePanel();

  useEffect(() => {
    let live = true;
    setStatus({ kind: 'loading' });
    (async () => {
      try {
        const { clip, episode } = await api.getClip(String(id));
        const resolved = await resolveClipEpisode({ stores, refreshShow: (url) => refreshShow(url, stores.feeds, Date.now()) }, episode);
        if (!live) return;
        setStatus({ kind: 'ready', clip, resolved });
        if (!clip.deleted) player.playClip(resolved.episode, { startMs: clip.startMs, endMs: clip.endMs });
      } catch (e) {
        if (!live) return;
        const message = e instanceof ApiError ? (e.code === 'not_found' ? 'No such clip.' : e.code === 'network' ? "Couldn't reach the server." : e.message) : String(e);
        setStatus({ kind: 'error', message });
      }
    })();
    return () => { live = false; };
  }, [id, api, stores, player]);

  if (status.kind === 'loading') return <><PageHeader title="Clip" /><Box className="flex-1 bg-background px-screen-x gap-row"><Text className="text-muted text-body">Opening the clip…</Text></Box></>;
  if (status.kind === 'error') return <><PageHeader title="Clip" /><Box className="flex-1 bg-background px-screen-x gap-row"><Text className="text-text text-body">{status.message}</Text></Box></>;
  const { clip, resolved } = status;
  const inClip = player.clip() !== undefined;
  const pausedAtEnd = state.kind === 'paused' && !inClip && 'positionMs' in state && Math.abs(state.positionMs - clip.endMs) <= 6_000;
  const showLine = resolved.episode.showTitle ? `${resolved.episode.showTitle}${resolved.via === 'server' ? ' · from the server\'s record (the feed no longer lists it)' : ''}` : undefined;
  const shareThis = () => share({ heading: 'Share this clip', more: { detail: 'other apps', run: () => void shareClip(Share, clip, resolved.episode.title, apiBaseUrl()) } });
  return (
    <>
    <PageHeader title="Clip" />
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-screen-x pt-1 pb-section gap-row">
      <ClipCard
        variant="hero"
        clip={clip}
        episodeTitle={resolved.episode.title}
        showTitle={showLine}
        onPlay={clip.deleted ? undefined : () => player.playClip(resolved.episode, { startMs: clip.startMs, endMs: clip.endMs })}
        onDelete={!clip.deleted && listener?.listenerId === clip.author.id ? () => void api.deleteClip(clip.id).then(() => setStatus({ kind: 'ready', clip: { ...clip, deleted: true }, resolved })) : undefined}
      />
      {clip.deleted ? <Text className="text-muted text-body text-center">This clip was removed. The episode is still here.</Text> : null}
      {!listener ? <Text className="text-muted text-body text-center">You are not signed in — clips play anyway. Sign in to follow people and make your own.</Text> : null}
    </ScrollView>
    <Box className="flex-row gap-gap items-center px-screen-x py-row bg-background border-t-hairline border-separator">
      {clip.deleted ? (
        <Pressable
          className="flex-1 bg-primary rounded-pill px-section items-center justify-center"
          style={TAP}
          accessibilityRole="button"
          accessibilityLabel="Play the episode"
          onPress={() => { player.load(resolved.episode, 'play'); router.push('/player'); }}
        >
          <Text className="text-onPrimary text-body font-bold">Play the episode</Text>
        </Pressable>
      ) : null}
      {pausedAtEnd ? (
        <Pressable
          className="flex-1 bg-primary rounded-pill px-section items-center justify-center"
          style={TAP}
          accessibilityRole="button"
          accessibilityLabel="Keep listening"
          onPress={() => player.play()}
        >
          <Text className="text-onPrimary text-body font-bold">Keep listening</Text>
        </Pressable>
      ) : null}
      <Pressable
        className="flex-1 flex-row gap-gap bg-surface border border-border rounded-pill px-section items-center justify-center"
        style={TAP}
        accessibilityRole="button"
        accessibilityLabel="Open player"
        onPress={() => router.push('/player')}
      >
        <Icon name="play-circle-outline" size={18} color={c.text} />
        <Text className="text-text text-body font-bold">Open player</Text>
      </Pressable>
      {clip.deleted ? null : (
        <Pressable
          className="bg-surface border border-border rounded-pill items-center justify-center"
          style={ROUND}
          accessibilityRole="button"
          accessibilityLabel="Share this clip"
          onPress={shareThis}
        >
          <Icon name="share-outline" size={20} color={c.accent} />
        </Pressable>
      )}
    </Box>
    {sharePanel}
    </>
  );
}
