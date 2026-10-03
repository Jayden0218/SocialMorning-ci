// "For You" list of suggested episodes, each with its reason; signed in only.
/**
 * M8 US2 — For You, the first section of Discover (FR-007).
 *
 * Signed out there is no section at all and Discover looks exactly as it did; that is the
 * owner's clarification of 2026-09-25, and it is why M5's H1 does not need re-running.
 *
 * Every row carries its reason, and the reason is part of the accessible name (FR-027).
 * A reason is not decoration: it is how a listener decides whether to trust the list, and
 * it is the only way L5 can be checked by a human at all.
 */
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import type { EpisodeCard, ForYou as ForYouBody } from '@/social/api';
import { EpisodeRow } from '@/ui/episode/EpisodeRow';

export function ForYou(props: {
  body?: ForYouBody;
  stale: boolean;
  fetchedAt?: number;
  onOpen: (card: EpisodeCard, index: number) => void;
}): React.ReactElement | null {
  if (props.body === undefined || props.body.items.length === 0) return null;
  return (
    <Box className="gap-2">
      <Text className="text-base font-semibold mb-1 text-text">For you</Text>
      {props.stale ? (
        <Text className="text-accent bg-surface p-2 rounded-md">
          Couldn't refresh — showing what was fetched {props.fetchedAt ? new Date(props.fetchedAt).toLocaleTimeString() : 'earlier'}.
        </Text>
      ) : null}
      {props.body.items.map((i, index) => (
        <EpisodeRow
          key={i.episode.id}
          card={i.episode}
          line={i.reason}
          label={`${i.episode.title}, ${i.episode.showTitle}. ${i.reason}`}
          onPress={() => props.onOpen(i.episode, index)}
        />
      ))}
    </Box>
  );
}
