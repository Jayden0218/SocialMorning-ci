// Your playlists: each with its count and public or private; make a new one by name.
/**
 * M19 T041 (US4, FR-030/031): the playlists you made (合集), newest change first as the server
 * sends them. A white card per playlist — its cover (the first episode's artwork), the title in
 * the serif, "n episodes · Public/Private" — opens the playlist. "New playlist" at the top takes
 * a name (1–60) and makes a private one. From the Me tab. Signed in only: playlists live on the
 * server so they reach your other phones (FR-032).
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { FlatList } from '@/ui/lib/flat-list';
import { Input, InputField } from '@/ui/lib/input';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit } from '@/design';
import { useSocial } from '@/social/context';
import { ApiError } from '@/social/api';
import { PLAYLIST_TITLE_MAX, useM19Api, type Playlist } from '@/social/m19-api';
import { PageHeader } from '@/ui/kit/PageHeader';
import { EndOfList } from '@/ui/kit/EndOfList';
import { Loader } from '@/ui/kit/Loader';
import { useColours } from '@/ui/kit/useColours';
import { EmptyPicture } from '@/ui/me/parts';
import { useStores, useToast } from '@/ui/shell/providers';
import { PlaylistCard } from '@/ui/me/PlaylistCard';

const TAP = { minHeight: hit.min };

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; items: Playlist[] };

export default function PlaylistsScreen(): React.ReactElement {
  const { listener } = useSocial();
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const m19 = useM19Api();
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
  const header = <PageHeader title="Playlists" subtitle="Collect episodes by theme; make one public to show it on your profile" />;
  if (!listener) return <>{header}<Box className="flex-1 bg-background px-screen-x"><Text className="text-muted text-body">Sign in to make playlists.</Text></Box></>;
  if (state.kind === 'loading') return <>{header}<Box className="flex-1 bg-background items-center p-4"><Loader /></Box></>;
  if (state.kind === 'error') {
    return (
      <>
      {header}
      <Box className="flex-1 bg-background px-screen-x gap-row">
        <Text className="text-text text-body">Couldn't load your playlists right now.</Text>
        <Pressable onPress={() => { setState({ kind: 'loading' }); load(); }} accessibilityRole="button" accessibilityLabel="Retry" className="justify-center self-start" style={TAP}><Text className="text-accent text-body font-semibold">Retry</Text></Pressable>
      </Box>
      </>
    );
  }
  const empty = title.trim() === '';
  return (
    <>
    {header}
    <FlatList
      className="flex-1 bg-background"
      data={state.items}
      keyExtractor={(p) => p.id}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow gap-row"
      ListHeaderComponent={
        <Box className="flex-row items-center gap-gap mb-gap">
          <Input className="flex-1 bg-surface border border-border rounded-row h-auto px-0">
            <InputField value={title} onChangeText={setTitle} maxLength={PLAYLIST_TITLE_MAX} placeholder="New playlist name" placeholderTextColor={c.muted} accessibilityLabel="New playlist name" returnKeyType="done" onSubmitEditing={create} className="p-row text-text text-body" />
          </Input>
          <Pressable onPress={create} disabled={busy || empty} accessibilityRole="button" accessibilityLabel="New playlist" accessibilityState={{ disabled: busy || empty }} className={`justify-center rounded-pill bg-primary px-section ${empty ? 'opacity-40' : ''}`} style={TAP}>
            <Text className="text-onPrimary text-body font-bold">Create</Text>
          </Pressable>
        </Box>
      }
      ListEmptyComponent={<EmptyPicture icon="albums-outline" line="No playlists yet. Name one above, or use Add to playlist in any episode's menu." />}
      ListFooterComponent={state.items.length > 0 ? <EndOfList /> : undefined}
      renderItem={({ item }) => <PlaylistCard playlist={item} mutedColour={c.muted} />}
    />
    </>
  );
}
