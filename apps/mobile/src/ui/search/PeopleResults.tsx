// Search results for people: avatar tiles, and the empty line under a people mark.
/**
 * M31 T030 (design-pulse2 `search--people-empty`). People are 1 x 1 tiles from the 28 lane, two to a row (84
 * tall, radius 22): the avatar (40), the name with the typed part lit and "Listener" under it; a tile opens the
 * profile. Empty: a 72 round people mark and "No one by that name." in Unbounded 18. Without a connection the
 * page says "Finding people needs a connection." (the caller's message, in a warn line).
 */
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, gutter, spacing } from '@/design';
import { useWindowDimensions } from 'react-native';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { Loader } from '@/ui/kit/Loader';
import { Type } from '@/ui/kit/Type';
import { DECK, DeckLink, DeckSection, PX } from '@/ui/discover/Deck';
import { MOSAIC } from '@/ui/discover/DiscoverMosaic';
import { Marked } from './Marked';

export type Person = { id: string; displayName: string | null };
export const PERSON_TILE = { height: 84, avatar: 40, mark: 72 } as const;

function PersonTile(props: { person: Person; term: string; onOpen: (p: Person) => void }): React.ReactElement {
  const p = props.person;
  return (
    <Pressable
      onPress={() => props.onOpen(p)}
      accessibilityRole="link"
      accessibilityLabel={p.displayName ?? 'Listener'}
      className="bg-raise"
      style={{ flex: 1, minWidth: 0, height: PERSON_TILE.height, borderRadius: MOSAIC.radius, justifyContent: 'center' }}
    >
      {/* The padding is inside (see ShowResults): a tile alone in its row stays as wide as the empty cell beside it. */}
      <Box className="flex-row items-center" style={{ padding: MOSAIC.pad, gap: spacing.row }}>
        <Artwork url={null} size={PERSON_TILE.avatar} rounded="pill" name={p.displayName ?? undefined} />
        <Box className="flex-1 min-w-0">
          <Marked text={p.displayName ?? ''} term={props.term} step="compact" bold />
          <Type step="caption" className="text-text2">Listener</Type>
        </Box>
      </Box>
    </Pressable>
  );
}

/** The People tab. */
export function PeopleGrid(props: { people: readonly Person[]; term: string; loading: boolean; /** Loaded, and nobody matched. */ none: boolean; /** F2a: the empty block's distance from the top of the content (drawn: starts 220 down the screen). */ noneTop?: number; onOpen: (p: Person) => void }): React.ReactElement {
  const { width } = useWindowDimensions();
  const rows: Person[][] = [];
  for (let i = 0; i < props.people.length; i += 2) rows.push(props.people.slice(i, i + 2));
  return (
    <Box style={{ marginLeft: DECK.lane, marginRight: gutter(width) - spacing.hair, gap: MOSAIC.gap }}>
      {props.loading ? <Loader className="my-section" /> : null}
      {props.none ? (
        <Box className="items-center" style={{ gap: PX.ten, marginTop: props.noneTop ?? spacing.group, marginLeft: -DECK.lane, marginRight: -(gutter(width) - spacing.hair) }}>
          <Box className="bg-raise2 items-center justify-center" style={{ width: PERSON_TILE.mark, height: PERSON_TILE.mark, borderRadius: PERSON_TILE.mark / 2 }}>
            <Icon name="people-outline" size={34} color={colour.idle} />
          </Box>
          <Type step="lede" className="text-text font-bold">No one by that name.</Type>
        </Box>
      ) : null}
      {rows.map((row, r) => (
        <Box key={r} className="flex-row" style={{ gap: MOSAIC.gap }}>
          {row.map((p) => <PersonTile key={p.id} person={p} term={props.term} onOpen={props.onOpen} />)}
          {row.length < 2 ? <Box style={{ flex: 1, minWidth: 0 }} /> : null}
        </Box>
      ))}
    </Box>
  );
}

/** The All tab's People: a row of small tiles with "More people ›". */
export function PeoplePreview(props: { people: readonly Person[]; term: string; onOpen: (p: Person) => void; more: boolean; onMore: () => void }): React.ReactElement | null {
  if (props.people.length === 0) return null;
  return (
    <DeckSection label="People" bottom={spacing.section}>
      <PeopleGrid people={props.people} term={props.term} loading={false} none={false} onOpen={props.onOpen} />
      {props.more ? <DeckLink label="More people" onPress={props.onMore} /> : null}
    </DeckSection>
  );
}
