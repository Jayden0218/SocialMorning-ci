// "Continue listening": the episode the player holds, with how far you got.
/** Spec 039 US2 (`design/B-Me.dc.html`): cover, title, show, a progress bar and the time left. Nothing is drawn while the player holds no episode. */
import { router } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Artwork } from '@/ui/kit/Artwork';
import { Type } from '@/ui/kit/Type';
import { Section } from '@/ui/kit/layout';
import { mmss } from '@/ui/kit/format';
import { bars, radius, spacing } from '@/design';
import { sameClock, sameHead, selectClock, selectHead, usePlayerSelector } from '@/playback/store';
import { episodeAndShow } from '@/ui/player/lookup';
import { useStores } from '@/ui/shell/providers';

const COVER = bars.cover + spacing.gap + spacing.hair;

export function ContinueCard(): React.ReactElement | null {
  const stores = useStores();
  const head = usePlayerSelector(selectHead, sameHead);
  const clock = usePlayerSelector(selectClock, sameClock);
  const id = head?.episodeId;
  if (id === undefined || !stores.feeds) return null;
  const { episode, show } = episodeAndShow(stores.feeds, id);
  const title = episode?.title ?? 'an episode';
  const duration = clock?.durationMs ?? episode?.durationMs;
  const position = clock?.positionMs ?? 0;
  const share = duration ? Math.min(1, Math.max(0, position / duration)) : undefined;
  const left = duration ? `${mmss(Math.max(0, duration - position))} left` : undefined;
  return (
    <Section title="Continue listening">
      <Pressable accessibilityRole="button" accessibilityLabel={`Continue listening: ${title}${left ? `, ${left}` : ''}`} onPress={() => router.push('/player')} className="flex-row items-center bg-raise" style={{ borderRadius: radius.artworkLarge, padding: spacing.row, gap: spacing.row }}>
        <Artwork url={episode?.imageUrl ?? show?.imageUrl} size={COVER} {...(show?.title !== undefined ? { name: show.title } : {})} />
        <Box className="flex-1" style={{ gap: spacing.hair }}>
          <Type step="strong" className="text-text" numberOfLines={2}>{title}</Type>
          {show?.title ? <Type step="small" className="text-text2" numberOfLines={1}>{show.title}</Type> : null}
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
