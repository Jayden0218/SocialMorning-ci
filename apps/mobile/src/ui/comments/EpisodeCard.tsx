// The episode with play/pause at the top of the comments page.
/**
 * The episode at the top of the comments page (Owner, 2026-10-01, after the 小宇宙 comments
 * page): artwork 48, the title on up to two lines, "show · length", and a play/pause button
 * wired to the player. Tapping the card opens the player when this episode is the one loaded.
 *
 * M17 (`Comments-B`): no card box any more — the episode sits on the page under the serif
 * title: artwork 40 with Editorial corners, the title in bold on one line, "show · length"
 * under it, and the play/pause as a round yellow button with dark glyph. Same actions.
 */
import { router } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { minutesLabel } from '@/ui/kit/format';
import { useStores } from '@/ui/shell/providers';
import { useColours } from '@/ui/kit/useColours';
import { usePlayer, usePlayerStatus } from '@/playback/store';
import { toPlayable } from '@/storage/playable';

export const CARD_ARTWORK = 40;
const ROUND = { width: hit.min, height: hit.min, minWidth: hit.min, minHeight: hit.min };

/** "Show · 69 min", leaving out whichever part is unknown. */
export function cardSubtitle(showTitle: string | undefined, durationMs: number | undefined): string {
  return [showTitle ?? '', minutesLabel(durationMs)].filter((x) => x !== '').join(' · ');
}

export function EpisodeCard(props: { episodeId: string }): React.ReactElement | null {
  const stores = useStores();
  const c = useColours(stores.settings);
  const player = usePlayer();
  // The lag audit (2026-10-04): re-render on play/pause/episode change only, then read the full
  // state fresh — usePlayerState re-rendered this page on every position tick.
  usePlayerStatus();
  const state = player.getState();
  const episode = stores.feeds.getEpisode(props.episodeId);
  if (!episode) return null;
  const show = stores.feeds.getShow(episode.feedUrl);
  const loaded = state.kind !== 'idle' && state.episodeId === props.episodeId;
  const playing = loaded && (state.kind === 'playing' || state.kind === 'buffering');
  const playable = loaded ? undefined : toPlayable(stores, props.episodeId);
  const canPlay = loaded || playable !== undefined;

  const toggle = () => {
    if (playing) { player.pause(); return; }
    if (loaded) { player.play(); return; }
    if (playable) player.load(playable, 'play');
  };
  const subtitle = cardSubtitle(show?.title, episode.durationMs);

  return (
    <Box className="flex-row items-center gap-row mx-screen-x">
      <Pressable
        onPress={() => (loaded ? router.push('/player') : router.push({ pathname: '/episode/[id]', params: { id: props.episodeId } }))}
        accessibilityRole="link"
        accessibilityLabel={`${episode.title}${subtitle ? `. ${subtitle}` : ''}`}
        className="flex-1 flex-row items-center gap-row"
        style={{ minHeight: hit.min }}
      >
        <Artwork url={episode.imageUrl ?? show?.imageUrl} size={CARD_ARTWORK} name={show?.title} />
        <Box className="flex-1">
          <Text className="text-text text-meta font-bold" numberOfLines={1}>{episode.title}</Text>
          {subtitle ? <Text className="text-muted text-xs" numberOfLines={1}>{subtitle}</Text> : null}
        </Box>
      </Pressable>
      {canPlay ? (
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          accessibilityState={{ selected: playing }}
          className="rounded-pill bg-primary items-center justify-center"
          style={ROUND}
        >
          <Icon name={playing ? 'pause' : 'play'} size={20} color={c.onPrimary} />
        </Pressable>
      ) : null}
    </Box>
  );
}
