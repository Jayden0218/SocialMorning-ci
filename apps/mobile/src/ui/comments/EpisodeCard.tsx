// The episode strip at the top of the comments page: cover, title, "show · 12:32 / 48:10", Play or Pause.
/**
 * Owner, 2026-10-01 (the 小宇宙 comments page): the episode, with its own play/pause, at the top of the page; a tap on it
 * opens the player when this episode is loaded, else the episode page.
 *
 * M31 W2-B (`social.html` `commentsBase`, the strip at top 56): a 36 cover (radius 10), the title in Geist 600 14/18 on one
 * line, the show and the playhead in mono 11 (text2) — "Morning Notes · 12:32 / 48:10" — and a 36 light circle with a void
 * pause or play glyph (a 48 tap by hitSlop). The playhead is the player's when this episode is loaded, else where the phone
 * last left it; with neither, the show and the length.
 */
import { router } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { minutesLabel, mmss } from '@/ui/kit/format';
import { colour, gutter } from '@/design';
import { useWindowDimensions } from 'react-native';
import { useStores } from '@/ui/shell/providers';
import { episodePlayView, sameEpisodePlayView, usePlayer, usePlayerSelector } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { COMMENTS } from './measures';
import { usePlayheadMs } from './usePlayhead';

export const CARD_ARTWORK = COMMENTS.stripCover;
const ROUND = { width: COMMENTS.pause, height: COMMENTS.pause };
const SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

/** "Show · 69 min", leaving out whichever part is unknown. */
export function cardSubtitle(showTitle: string | undefined, durationMs: number | undefined): string {
  return [showTitle ?? '', minutesLabel(durationMs)].filter((x) => x !== '').join(' · ');
}

/** "Show · 12:32 / 48:10" when the playhead is known, else "Show · 69 min". */
export function stripSubtitle(showTitle: string | undefined, positionMs: number | undefined, durationMs: number | undefined): string {
  if (positionMs === undefined || durationMs === undefined) return cardSubtitle(showTitle, durationMs);
  return [showTitle ?? '', `${mmss(positionMs)} / ${mmss(durationMs)}`].filter((x) => x !== '').join(' · ');
}

export function EpisodeCard(props: { episodeId: string }): React.ReactElement | null {
  const stores = useStores();
  const player = usePlayer();
  const { width } = useWindowDimensions();
  // The lag audit (2026-10-04, branch perf): only "is this episode loaded / playing" — this card
  // re-rendered (and re-read the episode) on every player tick with usePlayerState.
  const { loaded, playing } = usePlayerSelector((s) => episodePlayView(s, props.episodeId), sameEpisodePlayView);
  const head = usePlayheadMs(props.episodeId);
  const episode = stores.feeds.getEpisode(props.episodeId);
  if (!episode) return null;
  const show = stores.feeds.getShow(episode.feedUrl);
  const playable = loaded ? undefined : toPlayable(stores, props.episodeId);
  const canPlay = loaded || playable !== undefined;

  const toggle = () => {
    if (playing) { player.pause(); return; }
    if (loaded) { player.play(); return; }
    if (playable) player.load(playable, 'play');
  };
  const at = head ?? stores.positions.get(props.episodeId)?.offsetMs;
  const subtitle = stripSubtitle(show?.title, at, episode.durationMs);

  return (
    <Box className="flex-row items-center" style={{ marginHorizontal: gutter(width), gap: COMMENTS.stripGap }}>
      <Pressable
        onPress={() => (loaded ? router.push('/player') : router.push({ pathname: '/episode/[id]', params: { id: props.episodeId } }))}
        accessibilityRole="link"
        accessibilityLabel={`${episode.title}${subtitle ? `. ${subtitle}` : ''}`}
        className="flex-1 flex-row items-center"
        style={{ gap: COMMENTS.stripGap, minHeight: COMMENTS.stripCover }}
        hitSlop={{ top: 6, bottom: 6 }}
      >
        <Artwork url={episode.imageUrl ?? show?.imageUrl} size={CARD_ARTWORK} name={show?.title} />
        <Box className="flex-1">
          <Type step="compact" className="text-text" numberOfLines={1}>{episode.title}</Type>
          {subtitle ? <Type step="tag" className="text-text2" numberOfLines={1}>{subtitle}</Type> : null}
        </Box>
      </Pressable>
      {canPlay ? (
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          accessibilityState={{ selected: playing }}
          hitSlop={SLOP}
          className="rounded-pill bg-text items-center justify-center"
          style={ROUND}
        >
          <Icon name={playing ? 'pause' : 'play'} size={14} color={colour.void} />
        </Pressable>
      ) : null}
    </Box>
  );
}
