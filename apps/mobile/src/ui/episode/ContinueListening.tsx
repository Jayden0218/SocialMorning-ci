// Card to go on with your last episode (not on Updates since 2026-10-05; kept for reuse).
/**
 * "Continue listening" — the top of the Library, and the answer to Story 3's
 * whole complaint: coming back and not finding your place.
 *
 * M17 (`Library-B`, T041): an Editorial card — 96 pt artwork beside an accent eyebrow, the
 * episode title in the serif and "show · position"; a thin progress line when the length is
 * known; and a yellow "Continue" pill at the right. Same button, same name, same destination.
 *
 * Hidden when the last episode is finished; there is nothing to continue.
 */
import { useRouter } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Artwork } from '@/ui/kit/Artwork';
import { Card } from '@/ui/kit/Card';
import { Eyebrow } from '@/ui/kit/Eyebrow';
import { PlayIcon } from '@/ui/kit/Icon';
import { usePlayer } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { hit } from '@/design';
import { mmss } from '@/ui/kit/format';
import { useStores } from '@/ui/shell/providers';

const TAP = { minHeight: hit.min };

export function ContinueListening(): React.ReactElement | null {
  const stores = useStores();
  const player = usePlayer();
  const router = useRouter();

  const session = stores.session.get();
  if (session?.episodeId === undefined) return null;

  const episode = toPlayable(stores, session.episodeId);
  if (episode === undefined) return null;

  const saved = stores.positions.get(session.episodeId);
  if (saved?.finished === true) return null;

  const offsetMs = saved?.offsetMs ?? 0;
  const duration = episode.durationMs;
  const done = duration !== undefined && duration > 0 ? Math.min(1, Math.max(0, offsetMs / duration)) : undefined;

  return (
    <Card className="py-section">
      <Box className="flex-row items-center gap-row">
        <Artwork url={episode.artworkUrl ?? null} size={96} name={episode.showTitle} />
        <Box className="flex-1 gap-1">
          <Eyebrow accent>Continue listening</Eyebrow>
          <Text className="font-display text-title text-text" numberOfLines={2}>
            {episode.title}
          </Text>
          <Text className="text-xs text-muted">
            {episode.showTitle === '' ? mmss(offsetMs) : `${episode.showTitle} · ${mmss(offsetMs)}`}
          </Text>
        </Box>
      </Box>
      {done !== undefined && duration !== undefined ? (
        <Box className="h-1 rounded-pill bg-track mt-row overflow-hidden" accessible accessibilityRole="progressbar" accessibilityLabel={`${mmss(offsetMs)} of ${mmss(duration)} listened`}>
          <Box className="h-1 rounded-pill bg-accent" style={{ width: `${Math.round(done * 100)}%` as const }} />
        </Box>
      ) : null}
      <Box className="flex-row justify-end mt-row">
        <Pressable
          className="flex-row items-center gap-2 px-section rounded-pill bg-primary"
          style={TAP}
          accessibilityRole="button"
          accessibilityLabel={`Continue ${episode.title}`}
          onPress={() => {
            player.load(episode, 'play');
            router.push('/player');
          }}
        >
          <PlayIcon size={12} tint="onPrimary" />
          <Text className="text-onPrimary text-body font-bold">Continue</Text>
        </Pressable>
      </Box>
    </Card>
  );
}
