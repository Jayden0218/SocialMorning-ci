/**
 * Two buttons for the episode page (M10, owner 2026-09-27): ☆ Favourite, and 📌 Save
 * moment — the time you are at in this episode (or where you stopped), with an optional
 * note. Both are kept on this phone (`src/me/favourites.ts`, `src/me/moments.ts`).
 */
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { colour } from '../../design';
import { Icon } from '../Icon';
import { colour, hit } from '../../design';
import { isFavourite, toggleFavourite } from '../../me/favourites';
import { NOTE_MAX, saveMoment } from '../../me/moments';
import { mmss } from '../format';
import { useStores, useToast } from '../providers';

const TAP = { minHeight: hit.min };

export function EpisodeExtras(props: { episodeId: string; atMs: number }): React.ReactElement {
  const stores = useStores();
  const toast = useToast();
  const [fav, setFav] = useState(() => isFavourite(stores.settings, props.episodeId));
  const [note, setNote] = useState<string | undefined>(undefined);
  const [at, setAt] = useState(0);
  return (
    <View>
      <View className="flex-row items-center gap-x-3">
        <Pressable onPress={() => setFav(toggleFavourite(stores.settings, props.episodeId, Date.now()))} accessibilityRole="button" accessibilityState={{ selected: fav }} accessibilityLabel={fav ? 'Remove from favourites' : 'Add to favourites'} className="justify-center" style={TAP}>
          <View className="flex-row items-center gap-1"><Icon name={fav ? 'star' : 'star-outline'} size={16} color={colour.accent} /><Text className="text-accent text-sm">Favourite</Text></View>
        </Pressable>
        <Pressable onPress={() => { setAt(props.atMs); setNote(''); }} accessibilityRole="button" accessibilityLabel={`Save the moment at ${mmss(props.atMs)}`} className="justify-center" style={TAP}>
          <View className="flex-row items-center gap-1"><Icon name="bookmark-outline" size={16} color={colour.accent} /><Text className="text-accent text-sm">Save moment</Text></View>
        </Pressable>
      </View>
      {note !== undefined ? (
        <View className="bg-surface rounded-row p-row gap-row">
          <Text className="text-muted text-xs">Moment at {mmss(at)}</Text>
          <TextInput value={note} onChangeText={setNote} maxLength={NOTE_MAX} multiline placeholder="Add a note (optional)" placeholderTextColor={colour.muted} className="bg-background rounded-row p-row text-text text-sm" accessibilityLabel="Note for this moment" />
          <View className="flex-row gap-section">
            <Pressable onPress={() => { saveMoment(stores.settings, props.episodeId, at, note, Date.now()); setNote(undefined); toast(`Saved the moment at ${mmss(at)}.`); }} accessibilityRole="button" accessibilityLabel="Save moment" className="justify-center" style={TAP}><Text className="text-accent text-sm font-semibold">Save</Text></Pressable>
            <Pressable onPress={() => setNote(undefined)} accessibilityRole="button" accessibilityLabel="Cancel" className="justify-center" style={TAP}><Text className="text-muted text-sm">Cancel</Text></Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
