// After a voice recording: the text the phone heard, editable, with Post and Cancel.
/**
 * M20 US3 (spec FR-006, FR-008): shown between stopping a recording and posting it, for a voice
 * comment, a voice reply and a voice status. The text is the phone's speech service's; the listener
 * corrects it here, and what is posted is what this box holds (≤ 2000 characters). With no text the
 * box says so — the audio still posts.
 *
 * M31 W2-B (`social.html` `recordBar({ review: true })`): a raise2 card (radius 22, a 1 px line, padding 12, 10 between
 * parts) — "Your recording · 0:08" in mono 11 (text3), the text on a void field (radius 14, padding 10, Body 15/22), and a
 * quiet Cancel and a hot Post side by side.
 */
import { Box } from '@/ui/lib/box';
import { Textarea, TextareaInput } from '@/ui/lib/textarea';
import { PulseButton } from '@/ui/kit/PulseButton';
import { Type } from '@/ui/kit/Type';
import { useColours } from '@/ui/kit/useColours';
import { voiceClock } from '@/social/voice';

export const VOICE_TEXT_MAX = 2000;
const CARD = { borderRadius: 22, padding: 12, gap: 10 };
const FIELD = { minHeight: 72, borderRadius: 14 };

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
    <Box className="bg-raise2 border border-line" style={CARD} testID="voice-review">
      <Type step="tag" className="text-text3">{`Your recording · ${voiceClock(props.durationMs).split(' / ')[0]}`}</Type>
      <VoiceTextBox text={props.text} onChange={props.onChange} />
      <Box className="flex-row" style={{ gap: 10 }}>
        <Box className="flex-1"><PulseButton label="Cancel" accessibilityLabel="Throw the recording away" kind="quiet" onPress={props.onCancel} disabled={props.posting} full /></Box>
        <Box className="flex-1"><PulseButton label="Post" accessibilityLabel={props.postLabel} kind="hot" onPress={props.onPost} disabled={props.posting || over} busy={props.posting} full /></Box>
      </Box>
    </Box>
  );
}

/** The text alone — editable, with its count — or "No text for this recording". Also used by app/voice/new.tsx. */
export function VoiceTextBox(props: { text: string | null; onChange: (text: string) => void }): React.ReactElement {
  const c = useColours();
  if (props.text === null) return <Type step="note" className="text-text3">No text for this recording</Type>;
  const over = props.text.length > VOICE_TEXT_MAX;
  return (
    <Box className="gap-hair">
      <Textarea className="h-auto border-0 bg-void p-row" style={FIELD}>
        <TextareaInput
          placeholderTextColor={c.text3}
          className="text-pulse-body text-text align-top" style={{ padding: 0 }}
          multiline
          value={props.text}
          onChangeText={props.onChange}
          placeholder="What you said"
          accessibilityLabel="The text of your recording — correct it before posting"
        />
      </Textarea>
      <Type step="mono" className={over ? 'text-hotText text-right' : 'text-text3 text-right'}>{`${props.text.length} / ${VOICE_TEXT_MAX}`}</Type>
    </Box>
  );
}
