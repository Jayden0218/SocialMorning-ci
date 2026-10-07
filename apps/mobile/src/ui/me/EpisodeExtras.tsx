// Favourite, "Save moment" (with a note) and "Add to playlist" buttons in the episode menu.
/**
 * Two buttons for the episode page (M10, owner 2026-09-27): ☆ Favourite, and 📌 Save
 * moment — the time you are at in this episode (or where you stopped), with an optional
 * note. Both are kept on this phone (`src/me/favourites.ts`, `src/me/moments.ts`).
 *
 * M17 (`EpisodeMoreSheet-B`): the two are the last row of the ⋯ sheet's tile grid, and the note
 * opens as a white card under it — "Save this moment" with the time on the right, the note box
 * on the warm page colour, then Cancel and a yellow Save pill. Same names, same handlers.
 *
 * M19 T041 (US4): a third tile, "Add to playlist", opens a small white card under the grid — your
 * playlists (tap one to add the episode at its end) and "New playlist" with a title box, which
 * creates the playlist and adds the episode to it. Playlists live on the server (signed in only).
 */
import { reportAndDrop } from '@/telemetry/reportError';
import { useState } from 'react';
import { Input, InputField } from '@/ui/lib/input';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { SheetTile, TileRow } from '@/ui/queue/QueueButtons';
import { Icon } from '@/ui/kit/Icon';
import { hit } from '@/design';
import { useColours } from '@/ui/kit/useColours';
import { isFavourite, toggleFavourite } from '@/me/favourites';
import { NOTE_MAX, saveMoment } from '@/me/moments';
import { mmss } from '@/ui/kit/format';
import { useStores, useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { useM19Api, PLAYLIST_TITLE_MAX, type Playlist } from '@/social/m19-api';
import { ApiError } from '@/social/api';
import { registrationFor } from '@/social/registration';
import { Loader } from '@/ui/kit/Loader';

const TAP = { minHeight: hit.min };

export function EpisodeExtras(props: { episodeId: string; atMs: number }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const [fav, setFav] = useState(() => isFavourite(stores.settings, props.episodeId));
  const [note, setNote] = useState<string | undefined>(undefined);
  const [at, setAt] = useState(0);
  const { api, listener } = useSocial();
  const m19 = useM19Api();
  // M19 T041: undefined = picker closed; 'loading' while the list is fetched.
  const [lists, setLists] = useState<Playlist[] | 'loading' | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const failed = (e: unknown) => toast(e instanceof ApiError && e.status === 409 ? 'That playlist is full (300), or you have 50 playlists already.' : "Couldn't reach the server. Try again.");
  const openPicker = () => {
    if (!listener) { toast('Sign in to make playlists.'); return; }
    setNote(undefined);
    setLists('loading');
    m19.myPlaylists().then(setLists).catch((e) => { setLists(undefined); failed(e); });
  };
  /** The server must know the episode before it can list it (as a comment registers it first). */
  const add = async (playlistId: string) => {
    const reg = registrationFor(stores, props.episodeId);
    if (reg) await api.registerEpisode(props.episodeId, reg).catch(reportAndDrop('episode.register'));
    return m19.addToPlaylist(playlistId, props.episodeId);
  };
  const addTo = (p: Playlist) => {
    if (busy) return;
    setBusy(true);
    add(p.id)
      .then(() => { setLists(undefined); toast(`Added to ${p.title}.`); })
      .catch(failed)
      .finally(() => setBusy(false));
  };
  const create = () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    m19.createPlaylist(t)
      .then((p) => add(p.id).then(() => p))
      .then((p) => { setLists(undefined); setTitle(''); toast(`Made ${p.title} and added the episode.`); })
      .catch(failed)
      .finally(() => setBusy(false));
  };
  return (
    <Box>
      {/* M12 FR-032 made these full-width rows; M17 makes them a row of two tiles. */}
      <TileRow>
        <SheetTile icon={fav ? 'star' : 'star-outline'} label={fav ? 'Remove from favourites' : 'Add to favourites'} iconColour={c.accent} selected={fav} onPress={() => setFav(toggleFavourite(stores.settings, props.episodeId, Date.now()))} />
        <SheetTile icon="bookmark-outline" label="Save this moment" detail={mmss(props.atMs)} iconColour={c.accent} onPress={() => { setAt(props.atMs); setNote(''); }} accessibilityLabel={`Save the moment at ${mmss(props.atMs)}`} />
      </TileRow>
      <TileRow>
        <SheetTile icon="albums-outline" label="Add to playlist" iconColour={c.accent} onPress={openPicker} selected={lists !== undefined} />
        <Box className="flex-1" />
      </TileRow>
      {lists !== undefined ? (
        <Box className="bg-surface border border-border rounded-row p-row gap-1 mb-gap">
          <Box className="flex-row items-center gap-gap">
            <Icon name="albums-outline" size={18} color={c.accent} />
            <Text className="text-text text-body font-bold flex-1" accessibilityRole="header">Add to playlist</Text>
            <Pressable onPress={() => setLists(undefined)} accessibilityRole="button" accessibilityLabel="Close the playlist picker" className="justify-center px-row" style={TAP}><Text className="text-accent text-body font-bold">Cancel</Text></Pressable>
          </Box>
          {lists === 'loading' ? <Box className="items-center py-row"><Loader /></Box> : lists.map((p) => (
            <Pressable key={p.id} onPress={() => addTo(p)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Add to ${p.title}, ${p.count} episodes`} className="flex-row items-center gap-row border-b-hairline border-separator" style={TAP}>
              <Icon name={p.isPublic ? 'globe-outline' : 'lock-closed-outline'} size={16} color={c.muted} />
              <Text className="text-text text-body flex-1" numberOfLines={1}>{p.title}</Text>
              <Text className="text-muted text-xs">{p.count}</Text>
            </Pressable>
          ))}
          <Text className="text-muted text-xs mt-gap">New playlist</Text>
          <Box className="flex-row items-center gap-gap">
            <Input className="flex-1 bg-background border border-border rounded-row h-auto px-0">
              <InputField value={title} onChangeText={setTitle} maxLength={PLAYLIST_TITLE_MAX} placeholder="Playlist name" placeholderTextColor={c.muted} accessibilityLabel="New playlist name" returnKeyType="done" onSubmitEditing={create} className="p-row text-text text-body" />
            </Input>
            <Pressable onPress={create} disabled={busy || title.trim() === ''} accessibilityRole="button" accessibilityLabel="Create playlist and add" accessibilityState={{ disabled: busy || title.trim() === '' }} className={`justify-center rounded-pill bg-primary px-section ${title.trim() === '' ? 'opacity-40' : ''}`} style={TAP}><Text className="text-onPrimary text-body font-bold">Create</Text></Pressable>
          </Box>
        </Box>
      ) : null}
      {note !== undefined ? (
        <Box className="bg-surface border border-border rounded-row p-row gap-row mb-gap">
          <Box className="flex-row items-center gap-gap">
            <Icon name="bookmark-outline" size={18} color={c.accent} />
            <Text className="text-text text-body font-bold flex-1">Save this moment</Text>
            <Text className="text-muted text-xs">Moment at {mmss(at)}</Text>
          </Box>
          <Textarea className="bg-background rounded-row border border-border h-auto">
            <TextareaInput value={note} onChangeText={setNote} maxLength={NOTE_MAX} multiline placeholder="Add a note (optional)" placeholderTextColor={c.muted} accessibilityLabel="Note for this moment"  className="p-row text-text text-body" />
          </Textarea>
          <Box className="flex-row justify-end items-center gap-gap">
            <Pressable onPress={() => setNote(undefined)} accessibilityRole="button" accessibilityLabel="Cancel" className="justify-center px-row" style={TAP}><Text className="text-accent text-body font-bold">Cancel</Text></Pressable>
            <Pressable onPress={() => { saveMoment(stores.settings, props.episodeId, at, note, Date.now()); setNote(undefined); toast(`Saved the moment at ${mmss(at)}.`); }} accessibilityRole="button" accessibilityLabel="Save moment" className="justify-center rounded-pill bg-primary px-section" style={TAP}><Text className="text-onPrimary text-body font-bold">Save</Text></Pressable>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
