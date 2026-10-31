// One playlist as a card of a profile's Playlists deck: cover, name, number of episodes, public or private.
/**
 * M19 T041 (US4): a playlist row for a profile's public playlists. The cover is the server's `imageUrl` (the
 * first episode's artwork) or the name's tone; the name; "n episodes · Public/Private" under it. Tapping opens
 * `/playlists/<id>`.
 *
 * M31 D-C (design-pulse2 `profile--screen`: "Playlists (Deck)"): the card of a Deck under the edge label "Playlists" — 230 x 96, the
 * deck card (raise, a line border, radius 24), the cover 64 (radius 14) with the name in Unbounded 700 15 (two lines) and the count in
 * mono 11 text3 beside it. The drawing gives no size for this card; it is the Their likes card's width, with the Picks card's cover.
 */
import { router } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { spacing } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Type } from '@/ui/kit/Type';
import { plural } from '@socialmorning/social-core';
import type { Playlist } from '@/social/m19-api';
import { DECK, UNBOUNDED, DeckCard } from '@/ui/discover/Deck';
import { ME_TYPE } from '@/ui/me/measures';
import { PROFILE_PAGE } from '@/ui/profile/measures';

export function PlaylistCard(props: { playlist: Playlist }): React.ReactElement {
  const p = props.playlist;
  return (
    <DeckCard>
      <Pressable
        onPress={() => router.push({ pathname: '/playlists/[id]', params: { id: p.id } })}
        accessibilityRole="link"
        accessibilityLabel={`${p.title}, ${plural(p.count, 'episode')}, ${p.isPublic ? 'public' : 'private'}`}
        className="flex-1 flex-row items-center"
        style={{ padding: DECK.pad, gap: spacing.row }}
      >
        <Box style={{ width: PROFILE_PAGE.playlistCover, height: PROFILE_PAGE.playlistCover, borderRadius: PROFILE_PAGE.playlistCoverRadius, overflow: 'hidden' }}>
          <Artwork url={p.imageUrl} size={PROFILE_PAGE.playlistCover} name={p.title} />
        </Box>
        <Box className="flex-1 min-w-0" style={{ gap: spacing.hair }}>
          <Type step="lede" className="text-text font-bold" style={UNBOUNDED[15]} numberOfLines={2}>{p.title}</Type>
          <Type step="tag" className="text-text3" style={ME_TYPE.mono11} numberOfLines={1}>{`${plural(p.count, 'episode')} · ${p.isPublic ? 'Public' : 'Private'}`}</Type>
        </Box>
      </Pressable>
    </DeckCard>
  );
}
