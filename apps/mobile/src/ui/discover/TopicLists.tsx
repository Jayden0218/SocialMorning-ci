// Topic lists on Discover: the editors' collections as cards, each opening its full list.
/**
 * M21 US7 (T082, FR-061). The owner removed "Where to start" (the collections drawn as rows)
 * on 2026-10-05; M21 brings the same data back only in 小宇宙's "topic list" form — a row of
 * cards, and a full-list page per card (`/topic/[id]`). The cards are our own layout and words;
 * nothing is copied.
 *
 * M31 T030 (design-pulse2 `home--fold-b`, "Lists"): cards 200 x 130 — three covers (36) side by side
 * overlapping by 10 with a 2 ring in the card's colour, the list's title, and "<subtitle> · 8 episodes"
 * (the drawing's "Topic list · 8 episodes" when the list has no subtitle).
 */
import { router } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, spacing } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Type } from '@/ui/kit/Type';
import { plural } from '@socialmorning/social-core';
import type { Collection } from '@/social/api';
import { DECK, Deck, DeckCard, DeckSection, PX, useEdge } from './Deck';

const COVERS = 3;
/** Drawn: cards 200 x 130, covers 36 overlapping by 10 with a 2 ring. */
export const TOPIC_CARD = { width: 200, height: 130, cover: 36, overlap: 10, ring: 2 } as const;

export function TopicListCards(props: { lists: Collection[] }): React.ReactElement | null {
  const edge = useEdge('Topic lists', 'Lists');
  const lists = props.lists.filter((l) => l.items.length > 0);
  if (lists.length === 0) return null;
  return (
    <DeckSection {...edge}>
      <Deck width={TOPIC_CARD.width} height={TOPIC_CARD.height}>
        {lists.map((l) => (
          <DeckCard key={l.id}>
            <Pressable
              onPress={() => router.push({ pathname: '/topic/[id]', params: { id: l.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${l.title}${l.subtitle ? `. ${l.subtitle}` : ''}. ${plural(l.items.length, 'episode')}`}
              className="flex-1"
              style={{ padding: DECK.pad, gap: spacing.hair }}
            >
              <Box className="flex-row" style={{ marginBottom: PX.four }}>
                {l.items.slice(0, COVERS).map((i, k) => (
                  <Box key={i.key} style={{ marginLeft: k === 0 ? 0 : -TOPIC_CARD.overlap, borderWidth: TOPIC_CARD.ring, borderColor: colour.raise, borderRadius: 12 }}>
                    <Artwork url={i.episode.imageUrl} size={TOPIC_CARD.cover} name={i.episode.showTitle} />
                  </Box>
                ))}
              </Box>
              <Type step="compact" className="text-text font-bold" numberOfLines={2}>{l.title}</Type>
              <Type step="caption" className="text-text2" numberOfLines={1}>{`${plural(l.items.length, 'episode')} · ${l.subtitle ?? 'Topic list'}`}</Type>
            </Pressable>
          </DeckCard>
        ))}
      </Deck>
    </DeckSection>
  );
}
