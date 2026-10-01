/**
 * The episode at the top of the comments page (Owner, 2026-10-01, after the 小宇宙 comments
 * page): artwork 48, the title on up to two lines, "show · length", and a play/pause button
 * wired to the player. Tapping the card opens the player when this episode is the one loaded.
 */
import { router } from 'expo-router';
import { Pressable } from '../lib/pressable';
import { Text } from '../lib/text';
import { Box } from '../lib/box';
import { hit } from '../../design';
import { Artwork } from '../Artwork';
import { Icon } from '../Icon';
import { minutesLabel } from '../format';
import { useStores } from '../providers';
import { useColours } from '../useColours';
import { usePlayer, usePlayerState } from '../../playback/store';
import { toPlayable } from '../../storage/playable';

export const CARD_ARTWORK = 48;
const ROUND = { width: hit.min, height: hit.min, minWidth: hit.min, minHeight: hit.min };

/** "Show · 69 min", leaving out whichever part is unknown. */
export function cardSubtitle(showTitle: string | undefined, durationMs: number | undefined): string {
  return [showTitle ?? '', minutesLabel(durationMs)].filter((x) => x !== '').join(' · ');
}

export function EpisodeCard(props: { episodeId: string }): React.ReactElement | null {
  const stores = useStores();
  const c = useColours(stores.settings);
  const player = usePlayer();
  const state = usePlayerState();
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
    <Box className="flex-row items-center gap-row mx-screen-x mt-2 p-row bg-surface rounded-row">
      <Pressable
        onPress={() => (loaded ? router.push('/player') : router.push({ pathname: '/episode/[id]', params: { id: props.episodeId } }))}
        accessibilityRole="link"
        accessibilityLabel={`${episode.title}${subtitle ? `. ${subtitle}` : ''}`}
        className="flex-1 flex-row items-center gap-row"
        style={{ minHeight: hit.min }}
      >
        <Artwork url={episode.imageUrl ?? show?.imageUrl} size={CARD_ARTWORK} name={show?.title} />
        <Box className="flex-1">
          <Text className="text-text text-sm font-semibold" numberOfLines={2}>{episode.title}</Text>
          {subtitle ? <Text className="text-muted text-xs" numberOfLines={1}>{subtitle}</Text> : null}
        </Box>
      </Pressable>
      {canPlay ? (
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          accessibilityState={{ selected: playing }}
          className="rounded-pill bg-background items-center justify-center"
          style={ROUND}
        >
          <Icon name={playing ? 'pause' : 'play'} size={22} color={c.text} />
        </Pressable>
      ) : null}
    </Box>
  );
}
