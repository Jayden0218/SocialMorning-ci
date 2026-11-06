// "Continue listening": the episode the player holds, else the last one played on this phone, with how far you got.
/**
 * Spec 039 US2 (`design/B-Me.dc.html`): cover, title, show, a progress bar and the time left. Q3 (owner, 2026-11-06): while the player holds an
 * episode the card shows it; otherwise the last episode played, kept on the device (`src/me/last-played.ts`); otherwise nothing. Tapping the
 * stored one loads it and plays from the stored position (the player starts from the saved position row, written back if it is missing).
 */
import { router } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Artwork } from '@/ui/kit/Artwork';
import { Type } from '@/ui/kit/Type';
import { Section } from '@/ui/kit/layout';
import { mmss } from '@/ui/kit/format';
import { bars, radius, spacing } from '@/design';
import { sameClock, sameHead, selectClock, selectHead, usePlayer, usePlayerSelector, type PlayableEpisode } from '@/playback/store';
import { readLastPlayed, type LastPlayed } from '@/me/last-played';
import { toPlayable } from '@/storage/playable';
import type { Stores } from '@/storage/types';
import { episodeAndShow } from '@/ui/player/lookup';
import { useStores } from '@/ui/shell/providers';

const COVER = bars.cover + spacing.gap + spacing.hair;

/** The card's drawing, from what is known: used for the loaded episode and the stored one. */
function Card(props: { title: string; show: string | undefined; cover: string | undefined; position: number; duration: number | undefined; onPress: () => void }): React.ReactElement {
  const { title, position, duration } = props;
  const share = duration ? Math.min(1, Math.max(0, position / duration)) : undefined;
  const left = duration ? `${mmss(Math.max(0, duration - position))} left` : undefined;
  return (
    <Section title="Continue listening">
      <Pressable accessibilityRole="button" accessibilityLabel={`Continue listening: ${title}${left ? `, ${left}` : ''}`} onPress={props.onPress} className="flex-row items-center bg-raise" style={{ borderRadius: radius.artworkLarge, padding: spacing.row, gap: spacing.row }}>
        <Artwork url={props.cover} size={COVER} {...(props.show !== undefined ? { name: props.show } : {})} />
        <Box className="flex-1" style={{ gap: spacing.hair }}>
          <Type step="strong" className="text-text" numberOfLines={2}>{title}</Type>
          {props.show ? <Type step="small" className="text-text2" numberOfLines={1}>{props.show}</Type> : null}
          {share !== undefined ? (
            <Box testID="continue-progress" className="bg-raise2 overflow-hidden" style={{ height: bars.progress * 2, borderRadius: radius.tick }}>
              <Box className="bg-hot" style={{ height: bars.progress * 2, width: `${Math.round(share * 100)}%` }} />
            </Box>
          ) : null}
          {left ? <Type step="time" className="text-text2">{left}</Type> : null}
        </Box>
      </Pressable>
    </Section>
  );
}

/** What the player is handed for the stored episode: the cache (downloads first) when it still knows it, else what was stored. */
function playableFor(stores: Stores, last: LastPlayed): PlayableEpisode {
  const known = toPlayable(stores, last.id);
  if (known) return known;
  return { id: last.id, url: last.url, title: last.title, showTitle: last.showTitle, ...(last.artworkUrl !== undefined && { artworkUrl: last.artworkUrl }), ...(last.durationMs !== undefined && { durationMs: last.durationMs }), ...(last.feedUrl !== undefined && { feedUrl: last.feedUrl }) };
}

function StoredCard(props: { last: LastPlayed }): React.ReactElement {
  const stores = useStores();
  const player = usePlayer();
  const { last } = props;
  const play = (): void => {
    // The player starts an episode from its saved position row; if that row is gone, put the stored place back so it resumes there.
    if (!last.finished && stores.positions.get(last.id) === undefined) {
      stores.positions.save({ episodeId: last.id, offsetMs: last.positionMs, ...(last.durationMs !== undefined && { durationMsAtSave: last.durationMs }), finished: false }, Date.now());
    }
    player.load(playableFor(stores, last), 'play');
    router.push('/player');
  };
  return <Card title={last.title} show={last.showTitle || undefined} cover={last.artworkUrl} position={last.finished ? 0 : last.positionMs} duration={last.durationMs} onPress={play} />;
}

export function ContinueCard(): React.ReactElement | null {
  const stores = useStores();
  const head = usePlayerSelector(selectHead, sameHead);
  const clock = usePlayerSelector(selectClock, sameClock);
  const id = head?.episodeId;
  if (id === undefined) {
    const last = readLastPlayed(stores.settings);
    return last ? <StoredCard last={last} /> : null;
  }
  if (!stores.feeds) return null;
  const { episode, show } = episodeAndShow(stores.feeds, id);
  const title = episode?.title ?? 'an episode';
  const duration = clock?.durationMs ?? episode?.durationMs;
  const position = clock?.positionMs ?? 0;
  return <Card title={title} show={show?.title} cover={episode?.imageUrl ?? show?.imageUrl} position={position} duration={duration} onPress={() => router.push('/player')} />;
}
