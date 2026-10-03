/**
 * Saved moments (M10): the times you saved while listening, each with its note. Tapping
 * one plays the episode from that moment. Notes can be edited or the moment deleted.
 * The reference sells this as PLUS; here it is free (constitution: everything free).
 *
 * M17 (`Moments-B`): a timeline — the time in serif accent on the left, a rail with a yellow
 * dot, the episode title and note on the right, and Edit note / Delete moment as two icon
 * buttons beside the title. Editing opens the note box with a yellow Save pill and an
 * outlined Cancel. The count sits under the title (PageHeader's `subtitle`: it has no
 * eyebrow slot above the title). Play, edit and delete are unchanged.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { FlatList } from '@/ui/lib/flat-list';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { hit, tabular } from '@/design';
import { useColours } from '@/ui/kit/useColours';
import { deleteMoment, editMoment, listMoments, NOTE_MAX, type Moment } from '@/me/moments';
import { usePlayer } from '@/playback/store';
import { toPlayable } from '@/storage/playable';
import { mmss } from '@/ui/kit/format';
import { EmptyPicture } from '@/ui/me/parts';
import { useStores, useToast } from '@/ui/shell/providers';
import { PageHeader } from '@/ui/kit/PageHeader';
import { Icon } from '@/ui/kit/Icon';

const TAP = { minHeight: hit.min };
const ICON_BUTTON = { width: hit.min, height: hit.min };
/** The time column and the rail: widths are fixed so every dot sits on the one line. */
const TIME = { width: 84 };
const RAIL = 'w-6';
/** Where the note lines up: under the title, past the time column and the rail. */
const UNDER_TITLE = { marginLeft: 84 + 24 };

export default function MomentsScreen(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const player = usePlayer();
  const toast = useToast();
  const [rows, setRows] = useState<Moment[]>(() => listMoments(stores.settings));
  const [editing, setEditing] = useState<{ id: string; note: string } | undefined>();
  const reload = useCallback(() => setRows(listMoments(stores.settings)), [stores]);
  useFocusEffect(reload);

  const play = (m: Moment) => {
    const p = toPlayable(stores, m.episodeId);
    if (!p) { toast("That episode isn't on this phone any more."); return; }
    // The episode page's pattern: load, then seek to the moment.
    player.load(p, 'play');
    player.seek(m.atMs);
  };

  return (
    <>
    <PageHeader title="Saved moments" {...(rows.length > 0 ? { subtitle: `${rows.length} ${rows.length === 1 ? 'moment' : 'moments'}` } : {})} />
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      keyExtractor={(m) => m.id}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow"
      ListEmptyComponent={<EmptyPicture icon="bookmark-outline" line="No saved moments — tap “Save moment” while listening" />}
      renderItem={({ item }) => {
        const e = stores.feeds.getEpisode(item.episodeId);
        return (
          <Box className="pb-section">
            {/* The rail: one hairline down every row, so the rows read as one timeline. */}
            <Box className="absolute top-0 bottom-0 w-px bg-separator" style={{ left: 84 + 11 }} accessible={false} />
            <Box className="flex-row items-start">
              <Pressable onPress={() => play(item)} accessibilityRole="button" accessibilityLabel={`Play ${e?.title ?? 'episode'} from ${mmss(item.atMs)}`} className="flex-1 flex-row items-start" style={TAP}>
                <Text className="text-accent text-base font-display text-right pt-2.5" style={[TIME, tabular]} numberOfLines={1} adjustsFontSizeToFit>{mmss(item.atMs)}</Text>
                <Box className={`${RAIL} items-center pt-4`}><Box className="w-2.5 h-2.5 rounded-pill bg-primary" /></Box>
                <Text className="flex-1 text-text text-body font-bold pt-2.5" numberOfLines={3}>{e?.title ?? 'Episode not on this phone'}</Text>
              </Pressable>
              {editing?.id === item.id ? null : (
                <>
                  <Pressable onPress={() => setEditing({ id: item.id, note: item.note })} accessibilityRole="button" accessibilityLabel="Edit note" className="items-center justify-center" style={ICON_BUTTON}><Icon name="pencil-outline" size={18} color={c.accent} /></Pressable>
                  <Pressable onPress={() => { deleteMoment(stores.settings, item.id); reload(); }} accessibilityRole="button" accessibilityLabel="Delete moment" className="items-center justify-center" style={ICON_BUTTON}><Icon name="trash-outline" size={18} color={c.text} /></Pressable>
                </>
              )}
            </Box>
            <Box style={UNDER_TITLE} className="gap-gap">
              {editing?.id === item.id ? (
                <>
                  <Textarea className="bg-surface border border-border rounded-row h-auto">
                    <TextareaInput value={editing.note} onChangeText={(note) => setEditing({ id: item.id, note })} maxLength={NOTE_MAX} multiline placeholder="Your note" placeholderTextColor={c.muted} accessibilityLabel="Note"  className="p-row text-text text-body" />
                  </Textarea>
                  <Box className="flex-row gap-gap">
                    <Pressable onPress={() => { editMoment(stores.settings, item.id, editing.note); setEditing(undefined); reload(); }} accessibilityRole="button" accessibilityLabel="Save note" className="bg-primary rounded-pill px-section justify-center" style={TAP}><Text className="text-onPrimary text-body font-bold">Save</Text></Pressable>
                    <Pressable onPress={() => setEditing(undefined)} accessibilityRole="button" accessibilityLabel="Cancel" className="bg-surface border border-border rounded-pill px-section justify-center" style={TAP}><Text className="text-text text-body font-semibold">Cancel</Text></Pressable>
                  </Box>
                </>
              ) : item.note ? <Text className="text-muted text-body">{item.note}</Text> : <Text className="text-muted text-body italic">No note</Text>}
            </Box>
          </Box>
        );
      }}
    />
    </>
  );
}
