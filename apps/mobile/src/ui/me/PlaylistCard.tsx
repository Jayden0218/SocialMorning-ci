// One playlist as a white card: cover, name, number of episodes, public or private.
/**
 * M19 T041 (US4): a playlist row for your Playlists page and a profile's public playlists. The
 * cover is the server's `imageUrl` (the first episode's artwork) or the name's tone; the title
 * in the serif; "n episodes · Public/Private" under it. Tapping opens `/playlists/<id>`.
 */
import { router } from 'expo-router';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { Artwork } from '@/ui/kit/Artwork';
import { Icon } from '@/ui/kit/Icon';
import { plural } from '@socialmorning/social-core';
import type { Playlist } from '@/social/m19-api';

const TAP = { minHeight: hit.min };

export function PlaylistCard(props: { playlist: Playlist; mutedColour: string }): React.ReactElement {
  const p = props.playlist;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/playlists/[id]', params: { id: p.id } })}
      accessibilityRole="link"
      accessibilityLabel={`${p.title}, ${plural(p.count, 'episode')}, ${p.isPublic ? 'public' : 'private'}`}
      className="flex-row items-center gap-row p-row bg-surface border border-border rounded-row"
      style={TAP}
    >
      <Artwork url={p.imageUrl} size={56} rounded="row" name={p.title} />
      <Box className="flex-1 gap-0.5">
        <Text className="text-text text-base font-display" numberOfLines={2}>{p.title}</Text>
        <Text className="text-muted text-xs">{`${plural(p.count, 'episode')} · ${p.isPublic ? 'Public' : 'Private'}`}</Text>
      </Box>
      <Icon name="chevron-forward" size={16} color={props.mutedColour} />
    </Pressable>
  );
}
