// Two panes on a tablet: the list on the left, the chosen item on the right; just the list on a phone.
/**
 * M22 US16 (T071, research R14). On a wide window (`useLayout().wide`, ≥ 768 pt and not a phone)
 * a list page shows its list in a 400 pt column and the chosen item beside it; on a phone, or an
 * iPad in a narrow Split View, it renders the list alone — exactly the page it was.
 *
 * The right pane is the caller's `detail` (for an episode, `EpisodePane` below: artwork, title,
 * Play, show notes and "Open episode page"). The full pages stay ordinary routes on the root
 * stack, so every link and back swipe behaves as before. An iPad is wide in both orientations, so
 * a rotation keeps the same tree; only a Split View resize across 768 pt rebuilds the list
 * (its scroll place is then lost — NOT VERIFIED on a device how often that bites).
 *
 * Used by Updates (app/(tabs)/library.tsx); exported for History, Discover lists and Search.
 */
import { ScrollView } from '@/ui/lib/scroll-view';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Button } from '@/ui/kit/Button';
import { Artwork } from '@/ui/kit/Artwork';
import { ago, minutesLabel, noteParts } from '@/ui/kit/format';
import { ShowNotes } from '@/ui/episode/ShowNotes';
import { useStores } from '@/ui/shell/providers';
import { usePlayer } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { useLayout } from './useLayout';

export const LIST_PANE_WIDTH = 400;

export function ListDetail(props: {
  list: React.ReactNode;
  /** The right pane; undefined shows `placeholder`. */
  detail?: React.ReactNode;
  placeholder?: string;
}): React.ReactElement {
  const { wide } = useLayout();
  if (!wide) return <>{props.list}</>;
  return (
    <Box className="flex-1 flex-row bg-background">
      <Box style={{ width: LIST_PANE_WIDTH }}>{props.list}</Box>
      <Box className="flex-1 border-l-hairline border-separator">
        {props.detail ?? (
          <Box className="flex-1 items-center justify-center px-section">
            <Text className="text-muted text-body text-center">{props.placeholder ?? 'Choose an item to see it here.'}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** True when the page should open the item in the right pane instead of pushing its page. */
export function useOpensInPane(): boolean {
  return useLayout().wide;
}

/** The right pane for one episode: what the listener needs before opening the full page. */
export function EpisodePane(props: { episodeId: string; onOpenPage: () => void }): React.ReactElement {
  const stores = useStores();
  const player = usePlayer();
  const episode = stores.feeds.getEpisode(props.episodeId);
  if (episode === undefined) {
    return (
      <Box className="flex-1 items-center justify-center px-section">
        <Text className="text-muted text-body">This episode is no longer in the feed.</Text>
      </Box>
    );
  }
  const show = stores.feeds.getShow(episode.feedUrl);
  const play = () => { const p = toPlayable(stores, episode.id); if (p) player.load(p, 'play'); };
  const meta = [ago(episode.publishedAt, Date.now()), minutesLabel(episode.durationMs)].filter(Boolean).join(' · ');
  return (
    <ScrollView className="flex-1" contentContainerClassName="px-section pt-section pb-24">
      <Box className="flex-row gap-section items-center">
        <Artwork url={episode.imageUrl ?? show?.imageUrl} size={120} name={show?.title ?? episode.title} />
        <Box className="flex-1">
          <Text className="text-muted text-xs" numberOfLines={1}>{show?.title ?? ''}</Text>
          <Text className="text-text font-display text-title mt-1" accessibilityRole="header" numberOfLines={3}>{episode.title}</Text>
          {meta ? <Text className="text-muted text-xs mt-1">{meta}</Text> : null}
        </Box>
      </Box>
      <Box className="flex-row gap-gap mt-section">
        <Button label="Play" onPress={play} accessibilityLabel={`Play ${episode.title}`} className="flex-1" />
        <Button label="Open episode page" kind="secondary" onPress={props.onOpenPage} className="flex-1" />
      </Box>
      <ShowNotes parts={noteParts(episode.shownotesHtml, episode.durationMs)} onPlayFrom={() => play()} />
    </ScrollView>
  );
}
