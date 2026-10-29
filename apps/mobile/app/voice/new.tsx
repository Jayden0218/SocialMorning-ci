// Record a voice post up to 60 seconds for followers; deleted after 24 hours.
/**
 * Record a voice status (M12 FR-104): up to 60 s, heard by people who follow you, deleted by
 * the server after 24 hours. The microphone is used only while the button says "Recording".
 * Episode playback pauses first; the audio session returns to playback when recording ends
 * (with recording allowed, iOS would route sound to the earpiece — expo-audio's AudioMode).
 * The native calls are in src/playback/expo-audio-adapter.ts, the one file that imports expo-audio.
 *
 * M17 T068 (`VoiceNew-B`): the Editorial page — Cancel and the serif title, the three rules as a
 * numbered list, then a white card with the microphone disc beside the clock (large serif time,
 * the 1:00 cap small) and the state line; at the bottom, a bar with the record button as a pill
 * (yellow alone; outlined "Record again" beside a yellow Post once recorded). Same buttons, names
 * and handlers; the 60 s cap, the microphone-refused state and posting unchanged.
 *
 * M20 US3 (FR-006–FR-008): where the phone can make text, recording goes through `textRecorder`;
 * once recorded, the text shows under the clock, editable, and goes up with the audio on Post.
 *
 * M22 US6 (FR-020, T026): episode cards and photos (up to 10) can go with it —
 * `StatusComposerItems`; they go up in the `x-items` header with the recording.
 */
import { router } from 'expo-router';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { askMicrophone, useVoiceRecorder, voiceSessionOff, voiceSessionOn } from '@/playback/expo-audio-adapter';
import { Linking } from 'react-native';
import { Box } from '@/ui/lib/box';
import { ScrollView } from '@/ui/lib/scroll-view';
import { colour, gutter, radius, spacing } from '@/design';
import { PulseButton } from '@/ui/kit/PulseButton';
import { PushedPage } from '@/ui/kit/PushedPage';
import { Icon } from '@/ui/kit/Icon';
import { Type } from '@/ui/kit/Type';
import { PageGlow } from '@/ui/kit/PageGlow';
import { VoiceRing } from '@/ui/voice/VoiceRing';
import { VOICE_PAGE, voiceType } from '@/ui/voice/measures';
import { usePlayer } from '@/playback/store';
import { useColours } from '@/ui/kit/useColours';
import { useStores, useToast } from '@/ui/shell/providers';
import { useM12Api } from '@/social/m12-api';
import { ApiError } from '@/social/api';
import { VOICE_MAX_MS, voiceClock } from '@/social/voice';
import { textRecorder } from '@/social/voice-text';
import { VoiceTextBox } from '@/ui/comments/VoiceTextReview';
import { StatusComposerItems, itemsForPost, type ComposerItem } from '@/ui/social/StatusComposerItems';
import { useM22SocialApi } from '@/social/api-m22-social';
import { useSocial } from '@/social/context';
import { useWindowDimensions } from 'react-native';

/** The old one-line rule, word for word, split into `VoiceNew-B`'s numbered list. */
const RULES = ['Up to 60 seconds.', 'People who follow you can play it', 'for 24 hours; then it is deleted.'] as const;
type Phase = { kind: 'idle' } | { kind: 'denied' } | { kind: 'recording' } | { kind: 'done'; uri: string; ms: number } | { kind: 'posting'; uri: string; ms: number };

export default function NewVoicePost(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const player = usePlayer();
  const m12 = useM12Api();
  // M22 US6: the items that go with the recording.
  const m22 = useM22SocialApi();
  const { api } = useSocial();
  const [items, setItems] = useState<ComposerItem[]>([]);
  const { recorder, state } = useVoiceRecorder();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | undefined>();
  const stopping = useRef(false);
  // M20 US3: the text-making recorder, or undefined (then expo-audio, no text).
  const speech = useMemo(() => textRecorder(), []);
  const [elapsed, setElapsed] = useState(0);
  const [text, setText] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!speech || phase.kind !== 'recording') return;
    const t = setInterval(() => setElapsed(speech.elapsedMs()), 250);
    return () => clearInterval(t);
  }, [speech, phase.kind]);
  const recordedMs = speech ? elapsed : state.durationMillis;

  const restore = () => voiceSessionOff().catch(() => undefined);
  useEffect(() => () => { void restore(); }, []);

  const start = async () => {
    setError(undefined);
    setText(undefined);
    if (speech) {
      player.pause();
      if (!(await speech.start())) { setPhase({ kind: 'denied' }); return; }
      setElapsed(0);
      stopping.current = false;
      setPhase({ kind: 'recording' });
      return;
    }
    if (!(await askMicrophone())) { setPhase({ kind: 'denied' }); return; }
    player.pause();
    await voiceSessionOn();
    await recorder.prepareToRecordAsync();
    recorder.record();
    stopping.current = false;
    setPhase({ kind: 'recording' });
  };
  const stop = async () => {
    if (stopping.current) return;
    stopping.current = true;
    if (speech) {
      try {
        const take = await speech.stop();
        await restore();
        if (take.durationMs >= 1000) { setText(take.text); setPhase({ kind: 'done', uri: take.uri, ms: take.durationMs }); }
        else { setPhase({ kind: 'idle' }); setError('That was too short — hold on for at least a second.'); }
      } catch {
        await restore();
        setPhase({ kind: 'idle' });
        setError("That recording didn't work — try again.");
      }
      return;
    }
    const ms = Math.min(state.durationMillis, VOICE_MAX_MS);
    await recorder.stop();
    await restore();
    if (recorder.uri && ms >= 1000) setPhase({ kind: 'done', uri: recorder.uri, ms });
    else { setPhase({ kind: 'idle' }); setError('That was too short — hold on for at least a second.'); }
  };
  // The cap: stop at 60 s whatever the listener does.
  useEffect(() => { if (phase.kind === 'recording' && recordedMs >= VOICE_MAX_MS) void stop(); });

  const post = async (uri: string, ms: number) => {
    setPhase({ kind: 'posting', uri, ms });
    try {
      const blob = await (await fetch(uri)).blob();
      const transcript = text?.trim() ? text.trim().slice(0, 2000) : undefined;
      if (items.length > 0) await m22.postVoice(blob, ms, transcript, await itemsForPost(api, items));
      else await m12.postVoice(blob, ms, transcript);
      toast('Posted. It disappears in 24 hours.');
      router.back();
    } catch (e) {
      setPhase({ kind: 'done', uri, ms });
      setError(e instanceof ApiError && e.status === 429 ? 'You already have 5 live voice posts.' : e instanceof ApiError && e.status === 503 ? 'Voice posts are switched off right now.' : e instanceof ApiError && (e.status === 422 || e.status === 400) ? e.message : "That didn't post — try again.");
    }
  };

  const recording = phase.kind === 'recording';
  const shownMs = recording ? recordedMs : phase.kind === 'done' || phase.kind === 'posting' ? phase.ms : 0;
  // "0:24 / 1:00": the time large, the cap small beside it (`VoiceNew-B`).
  const [clock = '', cap = '1:00'] = voiceClock(shownMs).split(' / ');
  const recorded = phase.kind === 'done' || phase.kind === 'posting';
  const cancel = () => { if (phase.kind === 'recording') { if (speech) speech.cancel(); else void stop(); } router.back(); };
  const insets = useContext(SafeAreaInsetsContext);
  const { width } = useWindowDimensions();
  const side = gutter(width);
  return (
    <PushedPage
      title="Voice status"
      size={26}
      tone="none"
      now={false}
      safeBottom={insets?.bottom ?? 0}
      onBack={cancel}
      backIcon="close"
      backLabel="Cancel"
      {...(recorded ? { subtitle: `${shownMs >= 0 ? clock : ''} recorded` } : {})}
      {...(error ? { extra: <Type step="note" className="text-hotText" accessibilityLiveRegion="polite">{error}</Type>, extraAbove: VOICE_PAGE.errorLine } : {})}
      {...(recorded ? { right: <PulseButton label="Post" kind="hot" busy={phase.kind === 'posting'} onPress={() => { if (phase.kind === 'done') void post(phase.uri, phase.ms); }} /> } : {})}
    >
      {(layout) => (
        <Box className="flex-1">
          <PageGlow top={VOICE_PAGE.glowTop} strength={recording ? VOICE_PAGE.glowRecording : VOICE_PAGE.glowIdle} />
          {/* Drawn at fixed places on the page: the rules 10 under the status bar, the ring 120, the review (or the items row alone) 408 / 420. */}
          <Box className="absolute flex-row" style={{ left: side, right: side, top: layout.top + VOICE_PAGE.rulesTop, gap: VOICE_PAGE.tileGap }}>
            {RULES.map((line, i) => (
              <Box key={line} testID="voice-rule" className="flex-1 bg-raise" style={{ borderRadius: radius.row, padding: VOICE_PAGE.tilePad, gap: spacing.gap - 2 }}>
                <Box className="items-center justify-center bg-hotSoft rounded-pill" style={{ width: VOICE_PAGE.number, height: VOICE_PAGE.number }}><Type step="badge" className="text-hotText" style={voiceType.number}>{String(i + 1)}</Type></Box>
                <Type step="caption" className="text-text" style={voiceType.rule}>{line}</Type>
              </Box>
            ))}
          </Box>
          {phase.kind === 'denied' ? (
            <Box className="absolute items-center" style={{ left: spacing.block, right: spacing.block, top: layout.top + VOICE_PAGE.deniedTop, gap: spacing.row }}>
              <Box className="items-center justify-center bg-raise rounded-pill" style={{ width: VOICE_PAGE.deniedIcon, height: VOICE_PAGE.deniedIcon }}><Icon name="mic-off-outline" size={28} color={colour.hotText} /></Box>
              <Type step="row" className="text-text text-center" style={voiceType.denied}>SocialNet needs the microphone to record. You can allow it in the phone's settings.</Type>
              <PulseButton kind="ring" label="Open settings" onPress={() => void Linking.openSettings()} />
            </Box>
          ) : (
            <Box className="absolute items-center" style={{ left: 0, right: 0, top: layout.top + VOICE_PAGE.ringTop }}>
              <VoiceRing
                state={recording ? 'recording' : recorded ? 'done' : 'idle'}
                fraction={shownMs / VOICE_MAX_MS}
                seconds={Math.floor(shownMs / 1000)}
                clock={clock}
                cap={cap}
                line={recording ? 'Recording — tap to stop' : phase.kind === 'done' ? 'Tap to record again' : 'Tap to record'}
                label={recording ? 'Stop recording' : phase.kind === 'done' ? 'Record again' : 'Start recording'}
                busy={phase.kind === 'posting'}
                onPress={() => void (recording ? stop() : start())}
              />
            </Box>
          )}
          <ScrollView className="absolute" keyboardShouldPersistTaps="handled" style={{ left: 0, right: 0, bottom: 0, top: layout.top + (recorded && text !== undefined ? VOICE_PAGE.reviewTop : VOICE_PAGE.itemsTop) }} contentContainerStyle={{ paddingHorizontal: side, paddingBottom: layout.reserve, gap: VOICE_PAGE.belowRing }} showsVerticalScrollIndicator={false}>
            {recorded && text !== undefined ? (
              <Box style={{ gap: spacing.gap }}>
                <Type step="tag" className="text-text3" style={voiceType.caps}>WHAT YOU SAID — CHECK IT BEFORE POSTING</Type>
                <Box className="bg-raise" style={{ borderRadius: radius.row, padding: spacing.row }}><VoiceTextBox text={text} onChange={setText} /></Box>
              </Box>
            ) : null}
            <StatusComposerItems items={items} onChange={setItems} colours={c} />
          </ScrollView>
        </Box>
      )}
    </PushedPage>
  );
}
