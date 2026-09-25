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
import { StyleSheet, Text, View } from 'react-native';
import type { EpisodeCard, ForYou as ForYouBody } from '../social/api';
import { EpisodeRow } from './EpisodeRow';
import { colour, fontSize, spacing } from '../design';

export function ForYou(props: {
  body?: ForYouBody;
  stale: boolean;
  fetchedAt?: number;
  onOpen: (card: EpisodeCard, index: number) => void;
}): React.ReactElement | null {
  if (props.body === undefined || props.body.items.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.h2}>For you</Text>
      {props.stale ? (
        <Text style={styles.stale}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.gap },
  h2: { fontSize: fontSize.base, fontWeight: '600', marginBottom: 4, color: colour.text },
  stale: { color: colour.accent, backgroundColor: colour.surface, padding: spacing.gap, borderRadius: 6 },
});
