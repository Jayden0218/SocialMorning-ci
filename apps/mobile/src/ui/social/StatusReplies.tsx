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
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { askMicrophone, playVoice, useVoiceRecorder, voiceSessionOff, voiceSessionOn } from '@/playback/expo-audio-adapter';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Input, InputField } from '@/ui/lib/input';
import { Avatar } from '@/ui/kit/Avatar';
import { Icon } from '@/ui/kit/Icon';
import { Card, CardDivider } from '@/ui/kit/Card';
import { useConfirm } from '@/ui/kit/confirm';
import { useToast } from '@/ui/shell/providers';
import { hit } from '@/design';
import { mmss } from '@/ui/kit/format';
import { ApiError } from '@/social/api';
import { VOICE_MAX_MS, voiceClock } from '@/social/voice';
import { textLength } from '@/social/us8-api';
import { REACTIONS, REPLY_TEXT_MAX, useM22SocialApi, type Status, type StatusReply } from '@/social/api-m22-social';

const TAP = { minHeight: hit.min };
const DISC = { width: hit.min, height: hit.min };
const CHIP = { minHeight: hit.min, minWidth: hit.min };

export function StatusReplies(props: {
  status: Status;
  colours: { accent: string; muted: string; text: string; onPrimary: string };
  /** The episode and any status audio pause while recording or playing a reply. */
  pauseAll: () => void;
  /** After a reaction changes, the parent reloads the status (counts). */
  onChanged: () => void;
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
  return (
    <Box className="gap-section">
      {/* Six reactions; the owner's own status shows the counts only (no reacting to yourself). */}
      <Box className="flex-row flex-wrap gap-gap" accessibilityRole="radiogroup" accessibilityLabel="Reactions">
        {REACTIONS.map((r) => {
          const on = mine === r.kind;
          const count = (counts.get(r.kind) ?? 0) - (s.myReaction === r.kind ? 1 : 0) + (on ? 1 : 0);
          return (
            <Pressable
              key={r.kind}
              onPress={() => react(r.kind)}
              disabled={s.mine}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: s.mine }}
              accessibilityLabel={`${r.label}${count > 0 ? `, ${count}` : ''}${on ? '. Tap to take it back' : ''}`}
              className={`flex-row items-center justify-center gap-1 px-row rounded-pill border ${on ? 'bg-primary border-primary' : 'bg-surface border-border'}`}
              style={CHIP}
            >
              <Text className={on ? 'text-onPrimary text-body' : 'text-text text-body'}>{r.emoji}</Text>
              {count > 0 ? <Text className={on ? 'text-onPrimary text-meta font-bold' : 'text-muted text-meta font-bold'}>{String(count)}</Text> : null}
            </Pressable>
          );
        })}
      </Box>
      {s.mine && s.reactedBy && s.reactedBy.length > 0 ? (
        <Text className="text-muted text-xs" numberOfLines={3}>
          {`Reacted: ${s.reactedBy.slice(0, 12).map((x) => `${x.name} ${REACTIONS.find((r) => r.kind === x.kind)?.emoji ?? ''}`).join(', ')}${s.reactedBy.length > 12 ? ` and ${s.reactedBy.length - 12} more` : ''}`}
        </Text>
      ) : null}

      {/* Write or record a reply. */}
      {!s.mine ? (
        <Box className="gap-1">
          <Box className="flex-row items-center gap-gap">
            <Input className="flex-1 bg-surface border border-border rounded-pill h-auto px-0">
              <InputField value={text} onChangeText={setText} placeholder={recording ? `Recording ${voiceClock(state.durationMillis)}` : 'Reply to this status'} placeholderTextColor={props.colours.muted} accessibilityLabel="Reply to this status" style={TAP} className="px-section text-body text-text" editable={!recording} returnKeyType="send" onSubmitEditing={() => void sendText()} />
            </Input>
            {n > 0 ? (
              <Pressable onPress={() => void sendText()} disabled={busy || n > REPLY_TEXT_MAX} accessibilityRole="button" accessibilityLabel="Send reply" className="rounded-pill bg-primary items-center justify-center px-section" style={TAP}>
                <Text className="text-onPrimary text-body font-bold">Send</Text>
              </Pressable>
            ) : (
              <Pressable
                onPressIn={() => void startRecording()}
                onPressOut={() => void stopAndSend()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={recording ? 'Recording. Release, or double tap, to send' : 'Hold to record a voice reply'}
                accessibilityActions={[{ name: 'activate' }]}
                onAccessibilityAction={() => void (recording ? stopAndSend() : startRecording())}
                className={`rounded-pill items-center justify-center ${recording ? 'bg-primary' : 'bg-accentTint'}`}
                style={DISC}
              >
                <Icon name={recording ? 'radio-button-on' : 'mic-outline'} size={22} color={recording ? props.colours.onPrimary : props.colours.accent} />
              </Pressable>
            )}
          </Box>
          <Text className={n > REPLY_TEXT_MAX ? 'text-accent text-xs font-bold text-right' : 'text-muted text-xs text-right'}>
            {recording ? `${voiceClock(state.durationMillis)} · release to send` : n > 0 ? `${n} / ${REPLY_TEXT_MAX}` : 'Hold the mic for a voice reply, up to 60 seconds'}
          </Text>
        </Box>
      ) : null}

      {/* The replies: all of them for the owner; only mine for anyone else. */}
      {replies === undefined ? null : replies.length === 0 ? (
        <Text className="text-muted text-body">{s.mine ? 'No replies yet. Only you can see the replies to your status.' : 'Replies are private: only the poster sees them.'}</Text>
      ) : (
        <Card>
          {replies.map((r, i) => (
            <Box key={r.id}>
              {i > 0 ? <CardDivider /> : null}
              <Pressable
                onPress={() => play(r)}
                onLongPress={() => askDelete(r)}
                accessibilityRole="button"
                accessibilityLabel={`${r.mine ? 'You' : r.author.name}: ${r.body ?? `voice reply, ${Math.round((r.durationMs ?? 0) / 1000)} seconds${playing === r.id ? ', playing. Tap to stop' : '. Tap to play'}`}${r.mine || s.mine ? '. Long-press to delete' : ''}`}
                className="flex-row items-center gap-row py-row"
                style={TAP}
              >
                <Avatar url={r.author.avatarUrl ?? null} name={r.author.name} size={32} />
                <Box className="flex-1">
                  <Text className="text-text text-meta font-bold" numberOfLines={1}>{r.mine ? 'You' : r.author.name}</Text>
                  {r.body !== undefined ? <Text className="text-text text-body">{r.body}</Text>
                    : (
                      <Box className="flex-row items-center gap-1">
                        <Icon name={playing === r.id ? 'stop' : 'play'} size={14} color={props.colours.accent} />
                        <Text className="text-accent text-meta font-bold">{`Voice reply · ${mmss(r.durationMs ?? 0)}`}</Text>
                      </Box>
                    )}
                </Box>
              </Pressable>
            </Box>
          ))}
        </Card>
      )}
      {dialog}
    </Box>
  );
}
