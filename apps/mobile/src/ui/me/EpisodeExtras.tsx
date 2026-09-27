/**
 * Two buttons for the episode page (M10, owner 2026-09-27): ☆ Favourite, and 📌 Save
 * moment — the time you are at in this episode (or where you stopped), with an optional
 * note. Both are kept on this phone (`src/me/favourites.ts`, `src/me/moments.ts`).
 */
import { useState } from 'react';
import { Textarea, TextareaInput } from '../lib/textarea';
import { Pressable } from '../lib/pressable';
import { Text } from '../lib/text';
import { Box } from '../lib/box';
import { Icon } from '../Icon';
import { hit } from '../../design';
import { useColours } from '../useColours';
import { isFavourite, toggleFavourite } from '../../me/favourites';
import { NOTE_MAX, saveMoment } from '../../me/moments';
import { mmss } from '../format';
import { useStores, useToast } from '../providers';

const TAP = { minHeight: hit.min };

export function EpisodeExtras(props: { episodeId: string; atMs: number }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const [fav, setFav] = useState(() => isFavourite(stores.settings, props.episodeId));
  const [note, setNote] = useState<string | undefined>(undefined);
  const [at, setAt] = useState(0);
  return (
    <Box>
      <Box className="flex-row items-center gap-x-3">
        <Pressable onPress={() => setFav(toggleFavourite(stores.settings, props.episodeId, Date.now()))} accessibilityRole="button" accessibilityState={{ selected: fav }} accessibilityLabel={fav ? 'Remove from favourites' : 'Add to favourites'} className="justify-center" style={TAP}>
          <Box className="flex-row items-center gap-1"><Icon name={fav ? 'star' : 'star-outline'} size={16} color={c.accent} /><Text className="text-accent text-sm">Favourite</Text></Box>
        </Pressable>
        <Pressable onPress={() => { setAt(props.atMs); setNote(''); }} accessibilityRole="button" accessibilityLabel={`Save the moment at ${mmss(props.atMs)}`} className="justify-center" style={TAP}>
          <Box className="flex-row items-center gap-1"><Icon name="bookmark-outline" size={16} color={c.accent} /><Text className="text-accent text-sm">Save moment</Text></Box>
        </Pressable>
      </Box>
      {note !== undefined ? (
        <Box className="bg-surface rounded-row p-row gap-row">
          <Text className="text-muted text-xs">Moment at {mmss(at)}</Text>
          <Textarea className="bg-background rounded-row border-0 h-auto">
            <TextareaInput value={note} onChangeText={setNote} maxLength={NOTE_MAX} multiline placeholder="Add a note (optional)" placeholderTextColor={c.muted} accessibilityLabel="Note for this moment"  className="p-row text-text text-sm" />
          </Textarea>
          <Box className="flex-row gap-section">
            <Pressable onPress={() => { saveMoment(stores.settings, props.episodeId, at, note, Date.now()); setNote(undefined); toast(`Saved the moment at ${mmss(at)}.`); }} accessibilityRole="button" accessibilityLabel="Save moment" className="justify-center" style={TAP}><Text className="text-accent text-sm font-semibold">Save</Text></Pressable>
            <Pressable onPress={() => setNote(undefined)} accessibilityRole="button" accessibilityLabel="Cancel" className="justify-center" style={TAP}><Text className="text-muted text-sm">Cancel</Text></Pressable>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
