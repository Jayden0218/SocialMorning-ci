// The More sheet's two second pages: "Save this moment" (with a note) and "Add to playlist".
/**
 * M31 W3-A (T040; design-pulse2 `episode--more-sheet-save-moment` and `episode--more-sheet-playlist-picker`): when a tile
 * opens a second page the sheet swaps its tiles for it, under the episode head (cover 48).
 *
 * Save this moment: the time as a solid chip ("12:32") beside the title (Unbounded 16), the episode's mini curve (60 bars,
 * 30 tall; the played part graded hot → violet, a light bar at the moment), the note box (110 tall, radius 18, raise;
 * "Add a note (optional)"), then Cancel (quiet) and Save (light) side by side → "Saved the moment at 12:32."
 *
 * Add to playlist: "Add to playlist" (Unbounded 16) with Cancel in hot-text on its right ("Close the playlist picker"), the
 * listener's playlists as 2-column cover tiles (84 tall, radius 20; the title Unbounded 14, "12 episodes" in mono 11, a + circle)
 * — a tap adds the episode ("Added to {title}.") — then the "Playlist name" field (48) with Create (light; 40 % until a name
 * is typed) → "Made {title} and added the episode." Playlists live on the server, so the picker is for signed-in listeners
 * (the sheet says "Sign in to make playlists." before opening it).
 *
 * Same handlers as the old cards in `EpisodeExtras` (which the shared episode-row sheet still draws): the same saveMoment,
 * the same server calls, the same toasts and names.
 */
import { reportAndDrop } from '@/telemetry/reportError';
import { useEffect, useState } from 'react';
import { LinearGradient } from '@/design/tailwind';
import { Box } from '@/ui/lib/box';
import { Image } from '@/ui/lib/image';
import { Input, InputField } from '@/ui/lib/input';
import { Pressable } from '@/ui/lib/pressable';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { bars, colour, typeStyle } from '@/design';
import { Curve } from '@/ui/kit/Curve';
import { Icon } from '@/ui/kit/Icon';
import { Loader } from '@/ui/kit/Loader';
import { PulseButton } from '@/ui/kit/PulseButton';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { mmss } from '@/ui/kit/format';
import { NOTE_MAX, saveMoment } from '@/me/moments';
import { useStores, useToast } from '@/ui/shell/providers';
import { useSocial } from '@/social/context';
import { useM19Api, PLAYLIST_TITLE_MAX, type Playlist } from '@/social/m19-api';
import { ApiError } from '@/social/api';
import { registrationFor } from '@/social/registration';
import { EPISODE } from './measures';

const FOOT = [colour.clear, colour.pickFoot] as const;
const MARK = { width: 3, top: 0, bottom: 0 };

export function MomentPanel(props: { episodeId: string; atMs: number; /** The heat curve on the audio's axis (100 buckets). */ heat: readonly number[]; durationMs: number | undefined; onCancel: () => void; onSaved: () => void }): React.ReactElement {
  const stores = useStores();
  const toast = useToast();
  const [note, setNote] = useState('');
  const share = props.durationMs && props.durationMs > 0 ? Math.min(1, Math.max(0, props.atMs / props.durationMs)) : 0;
  return (
    <Box testID="moment-panel" style={{ gap: bars.sheetGap }}>
      <Box className="flex-row items-center gap-row">
        <TimestampChip text={mmss(props.atMs)} solid />
        <Type step="lede" className="text-text" style={{ fontSize: EPISODE.headTitle, lineHeight: EPISODE.headTitleLine }} accessibilityRole="header">Save this moment</Type>
      </Box>
      <Box style={{ height: EPISODE.noteBarsHeight }}>
        <Curve data={props.heat} count={EPISODE.noteBars} height={EPISODE.noteBarsHeight} played={share} />
        <Box testID="moment-mark" pointerEvents="none" className="absolute bg-text rounded-tick" style={[MARK, { left: `${Math.round(share * 100)}%` }]} accessible={false} importantForAccessibility="no-hide-descendants" />
      </Box>
      <Textarea className="h-auto bg-raise border-0" style={{ minHeight: EPISODE.noteBox.height, borderRadius: EPISODE.noteBox.radius }}>
        <TextareaInput
          value={note}
          onChangeText={setNote}
          maxLength={NOTE_MAX}
          multiline
          placeholder="Add a note (optional)"
          placeholderTextColor={colour.text3}
          accessibilityLabel="Note for this moment"
          className="text-pulse-body text-text align-top"
          style={[typeStyle('body'), { padding: EPISODE.noteBox.pad }]}
        />
      </Textarea>
      <Box className="flex-row" style={{ gap: EPISODE.tileGap }}>
        <PulseButton label="Cancel" kind="quiet" onPress={props.onCancel} className="flex-1" />
        <PulseButton
          label="Save moment"
          accessibilityLabel="Save moment"
          kind="hot"
          onPress={() => { saveMoment(stores.settings, props.episodeId, props.atMs, note, Date.now()); props.onSaved(); toast(`Saved the moment at ${mmss(props.atMs)}.`); }}
          className="flex-1"
        />
      </Box>
    </Box>
  );
}

export function PlaylistPanel(props: { episodeId: string; onClose: () => void }): React.ReactElement {
  const stores = useStores();
  const toast = useToast();
  const { api } = useSocial();
  const m19 = useM19Api();
  const [lists, setLists] = useState<Playlist[] | 'loading'>('loading');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const failed = (e: unknown) => toast(e instanceof ApiError && e.status === 409 ? 'That playlist is full (300), or you have 50 playlists already.' : "Couldn't reach the server. Try again.");
  useEffect(() => {
    let live = true;
    m19.myPlaylists().then((l) => { if (live) setLists(l); }).catch((e) => { if (live) { props.onClose(); failed(e); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m19]);
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
      .then(() => { props.onClose(); toast(`Added to ${p.title}.`); })
      .catch(failed)
      .finally(() => setBusy(false));
  };
  const create = () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    m19.createPlaylist(t)
      .then((p) => add(p.id).then(() => p))
      .then((p) => { props.onClose(); setTitle(''); toast(`Made ${p.title} and added the episode.`); })
      .catch(failed)
      .finally(() => setBusy(false));
  };
  const empty = title.trim() === '';
  return (
    <Box testID="playlist-panel" style={{ gap: bars.sheetGap }}>
      <Box className="flex-row items-center justify-between">
        <Type step="lede" className="text-text" style={{ fontSize: EPISODE.headTitle, lineHeight: EPISODE.headTitleLine }} accessibilityRole="header">Add to playlist</Type>
        <Pressable onPress={props.onClose} accessibilityRole="button" accessibilityLabel="Close the playlist picker" hitSlop={bars.chipPad} className="justify-center" style={{ minHeight: bars.circle }}>
          <Type step="compact" className="text-hotText">Cancel</Type>
        </Pressable>
      </Box>
      {lists === 'loading' ? <Box className="items-center py-row"><Loader /></Box> : (
        <Box className="flex-row flex-wrap justify-between" style={{ rowGap: EPISODE.tileGap }}>
          {lists.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => addTo(p)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Add to ${p.title}, ${p.count} episodes`}
              className="bg-raise overflow-hidden"
              style={{ width: '48.5%', height: EPISODE.pickerTile, borderRadius: EPISODE.infoTile.radius }}
            >
              {p.imageUrl ? <Image source={{ uri: p.imageUrl }} resizeMode="cover" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} accessibilityIgnoresInvertColors /> : null}
              <LinearGradient colors={FOOT} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
              <Box className="absolute" style={{ left: EPISODE.noteBox.pad - 2, right: EPISODE.noteBox.pad - 2, bottom: EPISODE.tileGap }}>
                <Type step="lede" className="text-text" style={{ fontSize: EPISODE.headTitle - 2, lineHeight: EPISODE.headTitleLine - 2 }} numberOfLines={1}>{p.title}</Type>
                <Type step="tag" className="text-quote" numberOfLines={1}>{`${p.count} episodes`}</Type>
              </Box>
              <Box className="absolute bg-raise2 items-center justify-center rounded-pill" style={{ right: EPISODE.tileGap, top: EPISODE.tileGap, width: bars.chip, height: bars.chip }} accessible={false} importantForAccessibility="no-hide-descendants">
                <Icon name="add" size={18} color={colour.text} />
              </Box>
            </Pressable>
          ))}
        </Box>
      )}
      <Box className="flex-row items-center" style={{ gap: EPISODE.tileGap }}>
        <Box className="flex-1 justify-center bg-raise2" style={{ height: bars.field, borderRadius: EPISODE.noteBox.radius, paddingHorizontal: EPISODE.noteBox.pad }}>
          <Input className="border-0 h-auto w-full">
            <InputField
              value={title}
              onChangeText={setTitle}
              maxLength={PLAYLIST_TITLE_MAX}
              placeholder="Playlist name"
              placeholderTextColor={colour.text3}
              accessibilityLabel="New playlist name"
              returnKeyType="done"
              onSubmitEditing={create}
              className="text-text text-pulse-body font-medium"
              style={[typeStyle('body'), { padding: 0 }]}
            />
          </Input>
        </Box>
        <PulseButton label="Create" accessibilityLabel="Create playlist and add" kind="light" onPress={create} disabled={busy || empty} />
      </Box>
    </Box>
  );
}
