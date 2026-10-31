// Replies and reactions under a status: a text box, hold to record a voice reply, six reactions, the owner's list.
/**
 * M22 US2 (FR-007, FR-008, T022). Under the status in the full-screen viewer:
 *  - six reaction buttons (our own set, `REACTIONS`); the chosen one is filled; tapping it again
 *    takes it back. The owner sees each count and who reacted.
 *  - a text box (≤ 140 characters, counted as the server counts) with Send, and a mic disc:
 *    hold to record a voice reply (≤ 60 s, stops by itself), release to send. A screen reader's
 *    double tap starts, a second one stops and sends (a hold cannot be done with VoiceOver).
 *    Permission and the audio session follow app/voice/new.tsx (askMicrophone, voiceSessionOn/Off).
 *  - the replies: the owner sees all of them, anyone else only their own (the server decides).
 *    A voice reply plays on tap. The owner can delete any reply; the author their own.
 * Everything here is deleted by the server with the status at 24 h (constitution 3.3.0).
 *
 * M31 W4-B (T051; design-pulse2 `statusBase`, `status--screen`, `status--reply-composer`, `status-replies--toast`, `status-reply--delete-dialog`): the
 * Stage's foot. Over the bar: the six reactions as 36 chips (yours light; counts in mono 13), the "Reacted: …" line (mono 11, text2) and the
 * replies — dark rows (avatar 22, name, words, "hold to delete") or, for anyone else's status, the line "Replies are private: only the poster sees
 * them." The bar: Close (the page's, passed as `leading`) and the 52 reply box (raise2, a 1 line that turns hot while you type; the mic 44, or a
 * hot Send 40 once there is text, and the count in mono 11 hot past 140). The bar rides up with the keyboard on iOS. Same reactions, boxes,
 * names and handlers; the line "Hold the mic for a voice reply, up to 60 seconds" is the mic's spoken hint now (the drawing has no such line).
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { askMicrophone, playVoice, useVoiceRecorder, voiceSessionOff, voiceSessionOn } from '@/playback/expo-audio-adapter';
import { Pressable } from '@/ui/lib/pressable';
import { Box } from '@/ui/lib/box';
import { Input, InputField } from '@/ui/lib/input';
import { Avatar } from '@/ui/kit/Avatar';
import { Icon } from '@/ui/kit/Icon';
import { ScrollView } from '@/ui/lib/scroll-view';
import { Type } from '@/ui/kit/Type';
import { barLift, useKeyboardHeight } from '@/ui/status/useKeyboardHeight';
import { STAGE, statusType } from '@/ui/status/measures';
import { useConfirm } from '@/ui/kit/confirm';
import { useToast } from '@/ui/shell/providers';
import { colour, gutter, spacing } from '@/design';
import { useWindowDimensions } from 'react-native';
import { mmss } from '@/ui/kit/format';
import { ApiError } from '@/social/api';
import { VOICE_MAX_MS, voiceClock } from '@/social/voice';
import { textLength } from '@/social/us8-api';
import { REACTIONS, REPLY_TEXT_MAX, useM22SocialApi, type Status, type StatusReply } from '@/social/api-m22-social';

const DISC = { width: STAGE.mic, height: STAGE.mic };
const CHIP = { height: STAGE.chip.height, borderRadius: STAGE.chip.radius, paddingHorizontal: STAGE.chip.pad, gap: STAGE.chip.inner };
const CHIP_SLOP = { top: STAGE.chip.slop, bottom: STAGE.chip.slop, left: 0, right: 0 };
const REPLY_SLOP = { top: STAGE.reply.slop, bottom: STAGE.reply.slop, left: 0, right: 0 };

export function StatusReplies(props: {
  status: Status;
  colours: { accent: string; muted: string; text: string; onPrimary: string };
  /** The episode and any status audio pause while recording or playing a reply. */
  pauseAll: () => void;
  /** After a reaction changes, the parent reloads the status (counts). */
  onChanged: () => void;
  /** The bar's first control: the page's Close (a × circle, bottom left). */
  leading?: React.ReactNode;
}): React.ReactElement {
  const s = props.status;
  const api = useM22SocialApi();
  const toast = useToast();
  const [confirm, dialog] = useConfirm();
  const [replies, setReplies] = useState<StatusReply[] | undefined>();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<number | null>(s.myReaction);
  const [playing, setPlaying] = useState<string | undefined>();
  const audio = useRef<{ stop: () => void } | undefined>(undefined);
  const { recorder, state } = useVoiceRecorder();
  const [recording, setRecording] = useState(false);
  const [focused, setFocused] = useState(false);
  const keyboard = useKeyboardHeight();
  const insets = useContext(SafeAreaInsetsContext);
  const { width } = useWindowDimensions();
  const side = gutter(width);
  const stopping = useRef(false);

  const load = useCallback(() => { api.replies(s.id).then(setReplies, () => setReplies([])); }, [api, s.id]);
  useEffect(() => { setMine(s.myReaction); setReplies(undefined); setText(''); load(); }, [s.id, s.myReaction, load]);
  const stopAudio = () => { audio.current?.stop(); audio.current = undefined; setPlaying(undefined); };
  useEffect(() => () => { stopAudio(); void voiceSessionOff().catch(() => undefined); }, []);

  const react = (kind: number) => {
    const before = mine;
    const next = before === kind ? null : kind;
    setMine(next);
    (next === null ? api.unreact(s.id) : api.react(s.id, kind)).then(props.onChanged, () => { setMine(before); toast("Couldn't react — try again."); });
  };

  const n = textLength(text);
  const sendText = async () => {
    if (n === 0 || n > REPLY_TEXT_MAX || busy) return;
    setBusy(true);
    try { await api.replyText(s.id, text); setText(''); load(); toast(s.mine ? 'Replied.' : 'Sent. Only the poster can see your reply.'); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Couldn't send — try again."); }
    finally { setBusy(false); }
  };

  const startRecording = async () => {
    if (recording || busy) return;
    if (!(await askMicrophone())) { toast('SocialNet needs the microphone to record. Allow it in the phone’s settings.'); return; }
    stopAudio();
    props.pauseAll();
    await voiceSessionOn();
    await recorder.prepareToRecordAsync();
    recorder.record();
    stopping.current = false;
    setRecording(true);
  };
  const stopAndSend = async () => {
    if (!recording || stopping.current) return;
    stopping.current = true;
    const ms = Math.min(state.durationMillis, VOICE_MAX_MS);
    await recorder.stop();
    await voiceSessionOff().catch(() => undefined);
    setRecording(false);
    if (!recorder.uri || ms < 1000) { toast('That was too short — hold for at least a second.'); return; }
    setBusy(true);
    try {
      const blob = await (await fetch(recorder.uri)).blob();
      await api.replyVoice(s.id, blob, ms);
      load();
      toast(s.mine ? 'Replied.' : 'Sent. Only the poster can hear your reply.');
    } catch (e) {
      toast(e instanceof ApiError && e.status === 503 ? 'Voice replies are switched off right now.' : "That didn't send — try again.");
    } finally { setBusy(false); }
  };
  // The cap: stop and send at 60 s whatever the finger does.
  useEffect(() => { if (recording && state.durationMillis >= VOICE_MAX_MS) void stopAndSend(); });

  const play = (r: StatusReply) => {
    if (playing === r.id) { stopAudio(); return; }
    stopAudio();
    if (!r.url) return;
    props.pauseAll();
    audio.current = playVoice(r.url, stopAudio);
    setPlaying(r.id);
  };
  const askDelete = (r: StatusReply) => {
    if (!r.mine && !s.mine) return;
    confirm({
      title: 'Delete this reply?', message: 'It is removed for you and the poster now.', cancel: 'Keep', action: 'Delete',
      onConfirm: () => { void api.deleteReply(s.id, r.id).then(load, () => toast("Couldn't delete — try again.")); },
    });
  };

  const counts = new Map(s.reactions.map((r) => [r.kind, r.count]));
  // The bar sits 6 over the page's foot, or 8 over the keyboard; the foot's column stands 76 over the bar.
  const bar = barLift(keyboard, insets?.bottom ?? 0, STAGE.barBottom, STAGE.keyboardGap);
  const over = n > REPLY_TEXT_MAX;
  return (
    <>
      <Box testID="status-foot" className="absolute" style={{ left: side, right: side, bottom: bar + STAGE.aboveBar, gap: STAGE.footGap, zIndex: 20 }} pointerEvents="box-none">
        {/* Six reactions; the owner's own status shows the counts only (no reacting to yourself). */}
        <Box className="flex-row flex-wrap" style={{ gap: STAGE.chip.gap }} accessibilityRole="radiogroup" accessibilityLabel="Reactions">
          {REACTIONS.map((r) => {
            const on = mine === r.kind;
            const count = (counts.get(r.kind) ?? 0) - (s.myReaction === r.kind ? 1 : 0) + (on ? 1 : 0);
            return (
              <Pressable
                key={r.kind}
                onPress={() => react(r.kind)}
                disabled={s.mine}
                hitSlop={CHIP_SLOP}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: s.mine }}
                accessibilityLabel={`${r.label}${count > 0 ? `, ${count}` : ''}${on ? '. Tap to take it back' : ''}`}
                className={`flex-row items-center justify-center border ${on ? 'bg-text border-text' : 'bg-glass border-line'}`}
                style={CHIP}
              >
                <Type step="body" className={on ? 'text-void' : 'text-text'} style={statusType.emoji}>{r.emoji}</Type>
                {count > 0 ? <Type step="badge" className={on ? 'text-void' : 'text-text'} style={statusType.count13}>{String(count)}</Type> : null}
              </Pressable>
            );
          })}
        </Box>
        {s.mine && s.reactedBy && s.reactedBy.length > 0 ? (
          <Type step="tag" className="text-text2" numberOfLines={3}>
            {`Reacted: ${s.reactedBy.slice(0, 3).map((x) => `${x.name} ${REACTIONS.find((r) => r.kind === x.kind)?.emoji ?? ''}`).join(', ')}${s.reactedBy.length > 3 ? ` and ${s.reactedBy.length - 3} more` : ''}`}
          </Type>
        ) : null}

        {/* The replies: all of them for the owner; only mine for anyone else. */}
        {replies === undefined ? null : replies.length === 0 ? (
          <Type step="caption" className="text-text3" style={statusType.note12}>{s.mine ? 'No replies yet. Only you can see the replies to your status.' : 'Replies are private: only the poster sees them.'}</Type>
        ) : (
          <ScrollView testID="status-replies" style={{ maxHeight: STAGE.reply.maxHeight }} contentContainerStyle={{ gap: STAGE.reply.rows }} showsVerticalScrollIndicator={false}>
            {replies.map((r) => {
              const deletable = r.mine || s.mine;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => play(r)}
                  onLongPress={() => askDelete(r)}
                  hitSlop={REPLY_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.mine ? 'You' : r.author.name}: ${r.body ?? `voice reply, ${Math.round((r.durationMs ?? 0) / 1000)} seconds${playing === r.id ? ', playing. Tap to stop' : '. Tap to play'}`}${deletable ? '. Long-press to delete' : ''}`}
                  className="flex-row items-center bg-raise"
                  style={{ gap: STAGE.reply.gap, borderRadius: STAGE.reply.radius, paddingVertical: STAGE.reply.pad, paddingHorizontal: STAGE.reply.padX }}
                >
                  <Avatar url={r.author.avatarUrl ?? null} name={r.author.name} size={STAGE.reply.avatar} />
                  <Type step="caption" className="text-text font-semibold" style={statusType.name13} numberOfLines={1}>{r.mine ? 'You' : r.author.name}</Type>
                  {r.body !== undefined ? <Type step="caption" className="text-text2 flex-1" style={statusType.name13} numberOfLines={2}>{r.body}</Type>
                    : (
                      <Box className="flex-1 flex-row items-center" style={{ gap: spacing.hair }}>
                        <Icon name={playing === r.id ? 'stop' : 'play'} size={14} color={colour.hotText} />
                        <Type step="tag" className="text-hotText" numberOfLines={1}>{`Voice reply · ${mmss(r.durationMs ?? 0)}`}</Type>
                      </Box>
                    )}
                  {deletable ? <Type step="tag" className="text-text3" style={statusType.hold10}>hold to delete</Type> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </Box>

      {/* The bar: Close, then the reply box (the owner has none: nobody replies to themselves). */}
      <Box testID="status-bar" className="absolute flex-row items-center" style={{ left: STAGE.barSide, right: STAGE.barSide, bottom: bar, gap: STAGE.barGap, zIndex: 30 }}>
        {props.leading}
        {!s.mine ? (
          <Box testID="status-reply-box" className={`flex-1 flex-row items-center bg-raise2 border ${focused || over ? 'border-hot' : 'border-line'}`} style={{ height: STAGE.boxHeight, borderRadius: STAGE.boxRadius, paddingLeft: STAGE.boxPadLeft, paddingRight: STAGE.boxPadRight, gap: spacing.hair }}>
            <Input className="flex-1 border-0 h-auto w-auto" style={{ paddingHorizontal: 0 }}>
              <InputField
                value={text}
                onChangeText={setText}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={recording ? `Recording ${voiceClock(state.durationMillis)} · release to send` : 'Reply to this status'}
                placeholderTextColor={colour.text3}
                accessibilityLabel="Reply to this status"
                className="text-text text-pulse-note font-medium"
                style={{ paddingVertical: 0 }}
                editable={!recording}
                returnKeyType="send"
                onSubmitEditing={() => void sendText()}
              />
            </Input>
            {n > 0 ? <Type step="tag" className={over ? 'text-hotText' : 'text-text3'}>{`${n} / ${REPLY_TEXT_MAX}`}</Type> : null}
            {n > 0 ? (
              <Pressable onPress={() => void sendText()} disabled={busy || over} hitSlop={REPLY_SLOP} accessibilityRole="button" accessibilityLabel="Send reply" className={`rounded-pill bg-hot items-center justify-center ${busy || over ? 'opacity-40' : ''}`} style={{ height: STAGE.send, paddingHorizontal: STAGE.sendPad }}>
                <Type step="row" className="text-void">Send</Type>
              </Pressable>
            ) : (
              <Pressable
                onPressIn={() => void startRecording()}
                onPressOut={() => void stopAndSend()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={recording ? 'Recording. Release, or double tap, to send' : 'Hold to record a voice reply'}
                accessibilityHint="Hold the mic for a voice reply, up to 60 seconds"
                accessibilityActions={[{ name: 'activate' }]}
                onAccessibilityAction={() => void (recording ? stopAndSend() : startRecording())}
                className={`rounded-pill items-center justify-center ${recording ? 'bg-hot' : ''}`}
                style={DISC}
              >
                <Icon name={recording ? 'radio-button-on' : 'mic-outline'} size={22} color={recording ? colour.void : colour.text} />
              </Pressable>
            )}
          </Box>
        ) : null}
      </Box>
      {dialog}
    </>
  );
}
