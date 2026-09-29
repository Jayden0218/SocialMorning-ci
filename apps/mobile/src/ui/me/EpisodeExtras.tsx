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
import { SheetRow } from '../SheetRow';
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
      {/* M12 FR-032: full-width rows in the ⋯ sheet. */}
      <SheetRow icon={fav ? 'star' : 'star-outline'} label={fav ? 'Remove from favourites' : 'Add to favourites'} iconColour={c.accent} selected={fav} onPress={() => setFav(toggleFavourite(stores.settings, props.episodeId, Date.now()))} />
      <SheetRow icon="bookmark-outline" label="Save this moment" detail={mmss(props.atMs)} iconColour={c.accent} onPress={() => { setAt(props.atMs); setNote(''); }} accessibilityLabel={`Save the moment at ${mmss(props.atMs)}`} />
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
