/**
 * Saved moments (M10): the times you saved while listening, each with its note. Tapping
 * one plays the episode from that moment. Notes can be edited or the moment deleted.
 * The reference sells this as PLUS; here it is free (constitution: everything free).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useColours } from '../src/ui/useColours';
import { deleteMoment, editMoment, listMoments, NOTE_MAX, type Moment } from '../src/me/moments';
import { usePlayer } from '../src/playback/store';
import { toPlayable } from '../src/storage/playable';
import { mmss } from '../src/ui/format';
import { EmptyPicture } from '../src/ui/me/parts';
import { useStores, useToast } from '../src/ui/providers';

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
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      keyExtractor={(m) => m.id}
      contentContainerClassName="px-screen-x py-row pb-24 flex-grow"
      ListEmptyComponent={<EmptyPicture icon="bookmark-outline" line="No saved moments — tap “Save moment” while listening" />}
      renderItem={({ item }) => {
        const e = stores.feeds.getEpisode(item.episodeId);
        return (
          <View className="bg-surface rounded-artwork p-section mb-row gap-row">
            <Pressable onPress={() => play(item)} accessibilityRole="button" accessibilityLabel={`Play ${e?.title ?? 'episode'} from ${mmss(item.atMs)}`}>
              <Text className="text-accent text-sm font-bold">▶ {mmss(item.atMs)}</Text>
              <Text className="text-text text-sm font-semibold" numberOfLines={2}>{e?.title ?? 'Episode not on this phone'}</Text>
            </Pressable>
            {editing?.id === item.id ? (
              <>
                <TextInput value={editing.note} onChangeText={(note) => setEditing({ id: item.id, note })} maxLength={NOTE_MAX} multiline placeholder="Your note" placeholderTextColor={c.muted}
                  className="bg-background rounded-row p-row text-text text-sm" accessibilityLabel="Note" />
                <View className="flex-row gap-section">
                  <Pressable onPress={() => { editMoment(stores.settings, item.id, editing.note); setEditing(undefined); reload(); }} accessibilityRole="button" accessibilityLabel="Save note" className="min-h-12 justify-center"><Text className="text-accent text-sm">Save</Text></Pressable>
                  <Pressable onPress={() => setEditing(undefined)} accessibilityRole="button" accessibilityLabel="Cancel" className="min-h-12 justify-center"><Text className="text-muted text-sm">Cancel</Text></Pressable>
                </View>
              </>
            ) : (
              <>
                {item.note ? <Text className="text-muted text-sm">{item.note}</Text> : null}
                <View className="flex-row gap-section">
                  <Pressable onPress={() => setEditing({ id: item.id, note: item.note })} accessibilityRole="button" accessibilityLabel="Edit note" className="min-h-12 justify-center"><Text className="text-accent text-sm">{item.note ? 'Edit note' : 'Add note'}</Text></Pressable>
                  <Pressable onPress={() => { deleteMoment(stores.settings, item.id); reload(); }} accessibilityRole="button" accessibilityLabel="Delete moment" className="min-h-12 justify-center"><Text className="text-muted text-sm">Delete</Text></Pressable>
                </View>
              </>
            )}
          </View>
        );
      }}
    />
  );
}
