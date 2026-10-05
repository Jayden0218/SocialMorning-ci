// After a voice recording: the text the phone heard, editable, with Post and Cancel.
/**
 * M20 US3 (spec FR-006, FR-008): shown between stopping a recording and posting it, for a voice
 * comment, a voice reply and a voice status. The text is the phone's speech service's; the listener
 * corrects it here, and what is posted is what this box holds (≤ 2000 characters). With no text the
 * box says so — the audio still posts.
 */
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { useColours } from '@/ui/kit/useColours';
import { hit } from '@/design';
import { voiceClock } from '@/social/voice';

const TAP = { minHeight: hit.min };
const BOX = { minHeight: 72 };
export const VOICE_TEXT_MAX = 2000;

export function VoiceTextReview(props: {
  /** null = the phone made no text for this recording. */
  text: string | null;
  durationMs: number;
  posting: boolean;
  postLabel: string;
  onChange: (text: string) => void;
  onPost: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const over = (props.text?.length ?? 0) > VOICE_TEXT_MAX;
  return (
    <Box className="bg-surface border border-border rounded-row px-section py-row gap-gap">
      <Text className="text-muted text-xs font-bold">{`Your recording · ${voiceClock(props.durationMs).split(' / ')[0]}`}</Text>
      <VoiceTextBox text={props.text} onChange={props.onChange} />
      <Box className="flex-row justify-end gap-gap">
        <Pressable onPress={props.onCancel} disabled={props.posting} accessibilityRole="button" accessibilityLabel="Throw the recording away"
          className="justify-center px-row" style={TAP}>
          <Text className="text-accent text-body font-bold">Cancel</Text>
        </Pressable>
        <Pressable onPress={props.onPost} disabled={props.posting || over} accessibilityRole="button" accessibilityLabel={props.postLabel}
          className={`bg-primary rounded-pill justify-center px-section ${props.posting || over ? 'opacity-50' : ''}`} style={TAP}>
          <Text className="text-onPrimary text-body font-bold">{props.posting ? 'Posting…' : 'Post'}</Text>
        </Pressable>
      </Box>
    </Box>
  );
}

/** The text alone — editable, with its count — or "No text for this recording". Also used by app/voice/new.tsx. */
export function VoiceTextBox(props: { text: string | null; onChange: (text: string) => void }): React.ReactElement {
  const c = useColours();
  if (props.text === null) return <Text className="text-muted text-sm">No text for this recording</Text>;
  const over = props.text.length > VOICE_TEXT_MAX;
  return (
    <Box className="gap-1">
      <Textarea className="h-auto border border-border rounded-row bg-background" style={BOX}>
        <TextareaInput
          placeholderTextColor={c.muted}
          className="text-sm text-text align-top"
          multiline
          value={props.text}
          onChangeText={props.onChange}
          placeholder="What you said"
          accessibilityLabel="The text of your recording — correct it before posting"
        />
      </Textarea>
      <Text className={over ? 'text-accent text-meta text-right' : 'text-muted text-meta text-right'}>{`${props.text.length} / ${VOICE_TEXT_MAX}`}</Text>
    </Box>
  );
}
