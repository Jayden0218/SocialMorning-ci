// Favourite and "Save moment" (with a note) buttons in the episode menu.
/**
 * Two buttons for the episode page (M10, owner 2026-09-27): ☆ Favourite, and 📌 Save
 * moment — the time you are at in this episode (or where you stopped), with an optional
 * note. Both are kept on this phone (`src/me/favourites.ts`, `src/me/moments.ts`).
 *
 * M17 (`EpisodeMoreSheet-B`): the two are the last row of the ⋯ sheet's tile grid, and the note
 * opens as a white card under it — "Save this moment" with the time on the right, the note box
 * on the warm page colour, then Cancel and a yellow Save pill. Same names, same handlers.
 */
import { useState } from 'react';
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
      {/* M12 FR-032 made these full-width rows; M17 makes them a row of two tiles. */}
      <TileRow>
        <SheetTile icon={fav ? 'star' : 'star-outline'} label={fav ? 'Remove from favourites' : 'Add to favourites'} iconColour={c.accent} selected={fav} onPress={() => setFav(toggleFavourite(stores.settings, props.episodeId, Date.now()))} />
        <SheetTile icon="bookmark-outline" label="Save this moment" detail={mmss(props.atMs)} iconColour={c.accent} onPress={() => { setAt(props.atMs); setNote(''); }} accessibilityLabel={`Save the moment at ${mmss(props.atMs)}`} />
      </TileRow>
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
