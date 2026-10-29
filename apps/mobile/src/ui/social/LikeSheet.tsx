// After you like an episode: add a short note (up to 140 characters), or skip.
/**
 * M19 T031 (US3): the sheet a like opens. The like is already saved; the note is optional and
 * goes with it to the people who follow you ("Likes" timeline). Save sends the note, Skip
 * keeps the like without one.
 *
 * M31 W3-D (design-pulse2 `episode--like-sheet`): the kit `ActionSheet` (it lifts above the keyboard);
 * a 52 hot heart disc, "Liked" in Unbounded 22 and the title; "Add a note, optional" (600 14); a 100 tall
 * raise field (radius 18, padding 14) holding the placeholder "Why you liked it (people who follow you
 * see this)"; Skip (quiet) and Save (light) side by side, 10 apart. The count line stays (data).
 */
import { useEffect, useState } from 'react';
import { Box } from '@/ui/lib/box';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { ActionSheet } from '@/ui/kit/ActionSheet';
import { Icon } from '@/ui/kit/Icon';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { useStores } from '@/ui/shell/providers';
import { LIKE_NOTE_MAX } from '@/social/profile-api';
import { like as likeMeasure } from '@/design/tokens';

export function LikeSheet(props: { open: boolean; title?: string; initialNote?: string; busy?: boolean; onSave: (note: string) => void; onSkip: () => void }): React.ReactElement | null {
  const stores = useStores();
  const c = useColours(stores.settings);
  const [note, setNote] = useState(props.initialNote ?? '');
  useEffect(() => { if (props.open) setNote(props.initialNote ?? ''); }, [props.open, props.initialNote]);
  return (
    <ActionSheet open={props.open} onClose={props.onSkip} label="Liked" keyboard>
      <Box className="flex-row items-center" style={{ gap: likeMeasure.headGap }}>
        <Box className="bg-hot items-center justify-center" style={{ width: likeMeasure.heart, height: likeMeasure.heart, borderRadius: likeMeasure.heart / 2 }}>
          <Icon name="heart" size={likeMeasure.heartIcon} color={c.void} />
        </Box>
        <Box className="flex-1">
          <Type step="title" className="text-text" accessibilityRole="header">Liked</Type>
          {props.title ? <Type step="caption" className="text-text2" numberOfLines={2}>{props.title}</Type> : null}
        </Box>
      </Box>
      <Type step="compact" className="text-text">Add a note, optional</Type>
      <Textarea className="bg-raise border-0 h-auto" style={{ minHeight: likeMeasure.field, borderRadius: likeMeasure.fieldRadius }}>
        <TextareaInput placeholderTextColor={c.text3} className="align-top text-text" style={{ padding: likeMeasure.fieldPad }} placeholder="Why you liked it (people who follow you see this)" value={note} onChangeText={(t) => setNote(t.slice(0, LIKE_NOTE_MAX))} multiline maxLength={LIKE_NOTE_MAX} accessibilityLabel="Note, optional" />
      </Textarea>
      <Type step="tag" className="text-text3 text-right">{note.length} / {LIKE_NOTE_MAX}</Type>
      <Box className="flex-row" style={{ gap: likeMeasure.buttonGap }}>
        <Box className="flex-1"><PulseButton label="Skip" kind="quiet" full onPress={props.onSkip} /></Box>
        <Box className="flex-1"><PulseButton label="Save" kind="light" full onPress={() => props.onSave(note.trim())} disabled={note.trim().length === 0} busy={props.busy === true} /></Box>
      </Box>
    </ActionSheet>
  );
}
