// Your playlists as a mosaic of covers, with their counts; name a new one in the foot of the page.
/**
 * M19 T041 (US4, FR-030/031): the playlists you made (合集), newest change first as the server
 * sends them. A tile per playlist — its cover (the first episode's artwork), its name, "n episodes" — opens the
 * playlist. A new playlist takes a name (1–60) and is private. From the Me tab. Signed in only: playlists live on
 * the server so they reach your other phones (FR-032).
 *
 * M31 W3-C (T041; design-pulse2 `listen.html` `playlists--screen`, `--signed-out`, `--empty`, `--load-error`,
 * `toast--playlists`; layout pattern Mosaic): two columns in the Me tab's lane, rows of 84, 10 apart. The first public
 * playlist (else the newest) is the 2 x 2 tile with PUBLIC in green, its name in Unbounded 800 22 and its count; the others
 * are 1 x 1 art tiles. The "New playlist name" field and the light Create button sit above the title bar, by the thumb
 * (Create is dim until a name is typed); the limit and a failure speak in a toast. Signed out: the empty block with a
 * Sign in button; none yet: "No playlists yet" with the field still there; a failed load: the grey glow, "Couldn't
 * load" and Retry.
 *
 * Spec 039 (Feed lane, design B): a `FeedPage`; the field and Create sit under the title (the list's header), the first playlist is a full-width tile
 * and the others tiles in two equal columns on the 20 gutter, 12 apart; a failed load is an `InlineNotice` with Retry.
 *
 * Not as drawn: the 2 x 2 tile's total time ("8 h 10 min") is not in the list the server sends, so it shows the count only.
 */
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { Input, InputField } from '@/ui/lib/input';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { colour, gutter, spacing } from '@/design';
import { useSocial } from '@/social/context';
import { ApiError } from '@/social/api';
import { PLAYLIST_TITLE_MAX, useM19Api, type Playlist } from '@/social/m19-api';
import { EndOfList } from '@/ui/kit/EndOfList';
import { Loader } from '@/ui/kit/Loader';
import { PulseButton } from '@/ui/kit/PulseButton';
import { InlineNotice } from '@/ui/kit/layout';
import { FeedEmpty, FeedPage } from '@/ui/feed/FeedPage';
import { Type } from '@/ui/kit/Type';
import { useToast } from '@/ui/shell/providers';
import { plural } from '@socialmorning/social-core';
import { ME_MOSAIC } from '@/ui/me/mosaic';
import { ME_TYPE } from '@/ui/me/measures';
import { ArtTile, KeyboardPage, LIST } from '@/ui/me/lists';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: Playlist[] };

type Row = { key: string; tiles: Playlist[]; big: boolean };

export default function PlaylistsScreen(): React.ReactElement {
  const { listener } = useSocial();
  const toast = useToast();
  const m19 = useM19Api();
  const { width } = useWindowDimensions();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    if (!listener) return;
    m19.myPlaylists().then((items) => setState({ kind: 'ok', items })).catch(() => setState((s) => (s.kind === 'ok' ? s : { kind: 'error' })));
  }, [listener, m19]);
  useFocusEffect(load);
  const create = () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    m19.createPlaylist(t)
      .then((p) => { setTitle(''); setState((s) => (s.kind === 'ok' ? { kind: 'ok', items: [p, ...s.items] } : { kind: 'ok', items: [p] })); })
      .catch((e) => toast(e instanceof ApiError && e.status === 409 ? 'You have 50 playlists already. Delete one first.' : "Couldn't make the playlist. Try again."))
      .finally(() => setBusy(false));
  };
  const empty = title.trim() === '';
  const edge = gutter(width);
  const wide = width - 2 * edge;
  const col = Math.floor((wide - spacing.row) / 2);

  // The field and Create, under the title. Not shown signed out or while loading.
  const field = (
    <Box testID="playlist-new" className="flex-row" style={{ gap: spacing.row - 2 }}>
      <Input className="flex-1 bg-raise2 border-0 h-auto" style={{ borderRadius: LIST.fieldRadius, paddingHorizontal: 0 }}>
        <InputField value={title} onChangeText={setTitle} maxLength={PLAYLIST_TITLE_MAX} placeholder="New playlist name" placeholderTextColor={colour.text3} accessibilityLabel="New playlist name" returnKeyType="done" onSubmitEditing={create} className="text-text text-pulse-row font-medium" style={{ height: LIST.field, paddingHorizontal: spacing.row + 2 }} />
      </Input>
      <PulseButton label="Create" accessibilityLabel="New playlist" onPress={create} disabled={busy || empty} />
    </Box>
  );
  const showField = listener !== undefined && state.kind !== 'loading';

  const tile = (p: Playlist, big: boolean) => (
    <Pressable
      key={p.id}
      onPress={() => router.push({ pathname: '/playlists/[id]', params: { id: p.id } })}
      accessibilityRole="link"
      accessibilityLabel={`${p.title}, ${plural(p.count, 'episode')}, ${p.isPublic ? 'public' : 'private'}`}
    >
      <ArtTile url={p.imageUrl} name={p.title} width={big ? wide : col} height={big ? ME_MOSAIC.row * 2 + ME_MOSAIC.gap : ME_MOSAIC.row} testID={big ? 'playlist-tile-big' : 'playlist-tile'}>
        {big && p.isPublic ? <Type step="badge" className="text-ok">PUBLIC</Type> : null}
        <Type step={big ? 'hero' : 'lede'} className="text-text" style={big ? ME_TYPE.tile22 : ME_TYPE.tile13} numberOfLines={big ? 2 : 2}>{p.title}</Type>
        <Type step={big ? 'mono' : 'caption'} className="text-quote" style={ME_TYPE.mono11}>{plural(p.count, 'episode')}</Type>
      </ArtTile>
    </Pressable>
  );

  const items = listener && state.kind === 'ok' ? state.items : [];
  const lead = items.find((p) => p.isPublic) ?? items[0];
  const rest = lead ? items.filter((p) => p.id !== lead.id) : [];
  const rows: Row[] = lead ? [{ key: lead.id, tiles: [lead], big: true }] : [];
  for (let i = 0; i < rest.length; i += 2) rows.push({ key: rest[i]!.id, tiles: rest.slice(i, i + 2), big: false });

  return (
    <KeyboardPage>
      <FeedPage<Row>
        title="Playlists"
        subtitle="Collect episodes by theme; make one public to show it on your profile"
        data={rows}
        keyExtractor={(r) => r.key}
        keyboardShouldPersistTaps="handled"
        contentStyle={{ flexGrow: 1 }}
        gap={spacing.row}
        header={<>
          {showField ? field : null}
          {listener && state.kind === 'error' ? <InlineNotice text="Couldn't load your playlists right now." actionLabel="Retry" onAction={() => { setState({ kind: 'loading' }); load(); }} /> : null}
        </>}
        ListEmptyComponent={
          !listener ? <FeedEmpty title="Playlists" line="Sign in to make playlists." action={{ label: 'Sign in', onPress: () => router.push('/auth/sign-in') }} />
          : state.kind === 'loading' ? <Box className="items-center"><Loader /></Box>
          : state.kind === 'error' ? undefined
          : <FeedEmpty title="No playlists yet" line="No playlists yet. Name one above, or use Add to playlist in any episode's menu." />
        }
        ListFooterComponent={rows.length > 0 ? <EndOfList /> : undefined}
        renderItem={({ item }) => (
          <Box className="flex-row" style={{ gap: spacing.row }}>{item.tiles.map((p) => tile(p, item.big))}</Box>
        )}
      />
    </KeyboardPage>
  );
}
