// After you like an episode: add a short note (up to 140 characters), or skip.
/**
 * M19 T031 (US3): the sheet a like opens. The like is already saved; the note is optional and
 * goes with it to the people who follow you ("Likes" timeline). Save sends the note, Skip
 * keeps the like without one.
 */
import { useEffect, useState } from 'react';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Heading } from '@/ui/lib/heading';
import { Actionsheet, ActionsheetBackdrop, ActionsheetContent, ActionsheetDragIndicator, ActionsheetDragIndicatorWrapper } from '@/ui/lib/actionsheet';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { hit } from '@/design';
import { Button } from '@/ui/kit/Button';
import { useColours } from '@/ui/kit/useColours';
import { useStores } from '@/ui/shell/providers';
import { LIKE_NOTE_MAX } from '@/social/profile-api';

const TAP = { minHeight: hit.min };

export function LikeSheet(props: { open: boolean; title?: string; initialNote?: string; busy?: boolean; onSave: (note: string) => void; onSkip: () => void }): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const [note, setNote] = useState(props.initialNote ?? '');
  useEffect(() => { if (props.open) setNote(props.initialNote ?? ''); }, [props.open, props.initialNote]);
  return (
    <Actionsheet isOpen={props.open} onClose={props.onSkip}>
      <ActionsheetBackdrop accessibilityRole="button" accessibilityLabel="Close" />
      <ActionsheetContent className="px-screen-x pt-row items-stretch" accessibilityViewIsModal>
        <ActionsheetDragIndicatorWrapper><ActionsheetDragIndicator /></ActionsheetDragIndicatorWrapper>
        <Heading className="text-display font-display text-text mt-gap" accessibilityRole="header">Liked</Heading>
        {props.title ? <Text className="text-body text-muted mt-1" numberOfLines={2}>{props.title}</Text> : null}
        <Text className="text-meta font-bold text-text mt-section mb-1.5">Add a note, optional</Text>
        <Textarea className="bg-surface border border-border rounded-row min-h-16 h-auto">
          <TextareaInput placeholderTextColor={c.muted} className="p-3 align-top text-body text-text" placeholder="Why you liked it (people who follow you see this)" value={note} onChangeText={(t) => setNote(t.slice(0, LIKE_NOTE_MAX))} multiline maxLength={LIKE_NOTE_MAX} accessibilityLabel="Note, optional" />
        </Textarea>
        <Text className="text-muted text-xs text-right mt-1">{note.length} / {LIKE_NOTE_MAX}</Text>
        <Box className="gap-1 mt-row">
          <Button label="Save" onPress={() => props.onSave(note.trim())} disabled={note.trim().length === 0} busy={props.busy === true} />
          <Pressable onPress={props.onSkip} accessibilityRole="button" accessibilityLabel="Skip" className="items-center justify-center" style={TAP}>
            <Text className="text-body font-bold text-accent">Skip</Text>
          </Pressable>
        </Box>
      </ActionsheetContent>
    </Actionsheet>
  );
}
