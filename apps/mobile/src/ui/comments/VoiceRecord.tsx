// The mic beside a comment box: tap to record a voice comment up to 60 s, then post it.
/**
 * M19 US6 (FR-044): `VoiceComposer` puts a yellow mic disc beside a write box (the comments page,
 * the reply page). Tap to record (the episode pauses), "Post" stops and posts, "Cancel" throws it
 * away; at 60 s it stops and posts by itself. The counter shows "0:12 / 1:00". The comment is
 * pinned to the episode's current moment when the player has this episode (`offsetMs`), else to
 * none. The episode resumes afterwards only if it was playing. Tap, not hold: a held button is
 * hard to use with VoiceOver, and the same two buttons serve both. Permission, the audio session
 * and the upload follow app/voice/new.tsx (POST /v1/episodes/:id/comments/voice, raw m4a).
 *
 * M20 US3 (FR-006–FR-008): where the phone can make text (Android 13+, iPhone, with the speech
 * service), recording goes through `textRecorder` and "Post" opens a review — the text, editable —
 * before posting; the text goes up with the audio. Elsewhere it records and posts as before, no text.
 *
 * M21 US6 (G-M21-7): a 428 rules_required opens the community rules (RulesSheet); Accept posts the
 * same recording again, Not now drops it (nothing was stored by the server).
 *
 * M31 W2-B (`social.html` `recordBar`, `comments--voice-record`): the mic is a 44 button the page places itself (children may be a
 * function that receives it — the Pulse composer carries it inside its pill). Recording turns the bar into the 56 recorder with a
 * 1.5 hot border: a × (Cancel recording), the moment chip (where it started), a breathing 8 hot dot, a 24-bar wave that fills as
 * the seconds pass, the clock in mono, and a 40 hot check ("Stop recording and check the text", or "Stop and post …" with no
 * speech service). The review card and the rules sheet are in VoiceTextReview.tsx and RulesSheet.tsx. Posting, the 60 s cap, the
 * moment and the player's pause are as before.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { router } from 'expo-router';
import { askMicrophone, useVoiceRecorder, voiceSessionOff, voiceSessionOn } from '@/playback/expo-audio-adapter';
import { usePlayer } from '@/playback/store';
import { Box } from '@/ui/lib/box';
import { Curve } from '@/ui/kit/Curve';
import { IconButton } from '@/ui/kit/PulseButton';
import { TimestampChip } from '@/ui/kit/TimestampChip';
import { Type } from '@/ui/kit/Type';
import { useReducedMotion } from '@/ui/kit/useReducedMotion';
import { mmss } from '@/ui/kit/format';
import { colour, motion } from '@/design';
import { VOICE_MAX_MS, voiceClock } from '@/social/voice';
import { ApiError } from '@/social/api';
import { needsRules, useCommentExtrasApi } from '@/social/comment-extras-api';
import { RulesSheet } from './RulesSheet';
import { useSocial } from '@/social/context';
import { useToast } from '@/ui/shell/providers';
import { textRecorder, type VoiceTake } from '@/social/voice-text';
import { VoiceTextReview } from './VoiceTextReview';
import { voiceWave } from './VoiceComment';
import { COMMENTS } from './measures';

/** The recorder bar (`social.html` `recordBar`): 56, radius 22, raise2, a 1.5 hot border, padding 0 8, 10 between parts. */
const BAR = { minHeight: COMMENTS.composerHeight, borderRadius: COMMENTS.composerRadius, borderWidth: COMMENTS.recorderBorder, borderColor: colour.hot, paddingHorizontal: 8, gap: 10 };
const DOT = { width: COMMENTS.dot, height: COMMENTS.dot };

/** The breathing hot dot: opacity 1 → 0.5 → 1 on 2.4 s (a still dot with Reduce Motion). */
function BreathingDot(): React.ReactElement {
  const still = useReducedMotion();
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (still) { o.setValue(1); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 0.5, duration: motion.breathe / 2, useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: motion.breathe / 2, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [still, o]);
  return <Animated.View accessible={false} style={[DOT, { borderRadius: COMMENTS.dot / 2, backgroundColor: colour.hot, opacity: o }]} testID="record-dot" />;
}

/** Why a voice comment did not post, in plain words. */
export function voicePostError(e: unknown): string {
  // M22 US10 (FR-032): banned on this show — the server's plain words ("The host has turned off comments for you on this show.").
  if (e instanceof ApiError && e.code === 'muted_on_show') return e.message || 'The host has turned off comments for you on this show.';
  if (e instanceof ApiError && e.status === 503) return 'Voice comments are switched off right now.';
  if (e instanceof ApiError && e.status === 413) return 'That recording is too long — 60 seconds at most.';
  // iPhone walk 2026-10-06: a 422 has many causes (length, format, an empty upload) — the server's own words say which.
  if (e instanceof ApiError && e.status === 422) return e.message || 'That recording could not be read.';
  if (e instanceof ApiError && e.status === 429) return 'Too many comments just now — try again in a minute.';
  return "That didn't post — try again.";
}

type Phase = 'idle' | 'recording' | 'review' | 'posting';

export function VoiceComposer(props: {
  episodeId: string;
  /** A reply's parent comment. */
  parentId?: string;
  /** The episode's moment now, when the player has this episode; read when recording starts. */
  offsetMs: () => number | undefined;
  onPosted: () => void;
  /**
   * The write box, replaced by the recording bar while recording. Either a node (drawn beside the mic, as before) or a
   * function that is given the mic button and places it itself — the Pulse composer carries the mic inside its pill.
   */
  children: React.ReactNode | ((mic: React.ReactElement) => React.ReactNode);
}): React.ReactElement {
  const toast = useToast();
  const player = usePlayer();
  const extras = useCommentExtrasApi();
  const { listener } = useSocial();
  const { recorder, state } = useVoiceRecorder();
  const [phase, setPhase] = useState<Phase>('idle');
  // M20 US3: the text-making recorder, or undefined (then the expo-audio recorder, no text).
  const speech = useMemo(() => textRecorder(), []);
  const [elapsed, setElapsed] = useState(0);
  const [take, setTake] = useState<VoiceTake | undefined>(undefined);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!speech || phase !== 'recording') return;
    const t = setInterval(() => setElapsed(speech.elapsedMs()), 250);
    return () => clearInterval(t);
  }, [speech, phase]);
  const recordedMs = speech ? elapsed : state.durationMillis;
  const at = useRef<number | undefined>(undefined);
  const resume = useRef(false);
  const stopping = useRef(false);
  const discard = useRef(false);
  // M21 US6: the recording waiting for the rules to be accepted.
  const pending = useRef<{ blob: Blob; ms: number; transcript: string | null } | undefined>(undefined);
  const [rules, setRules] = useState(false);
  const wave = useMemo(() => voiceWave(7000), []);

  const used = useRef(false);
  const restore = () => voiceSessionOff().catch(() => undefined);
  // Back to the player's audio mode on leaving — only if this box ever switched recording on.
  useEffect(() => () => { if (used.current) void restore(); }, []);
  const resumeEpisode = () => { if (resume.current) { resume.current = false; player.play(); } };

  const start = async () => {
    if (!listener) { router.push('/auth/sign-in'); return; }
    if (!speech && !(await askMicrophone())) { toast('SocialNet needs the microphone — allow it in the phone\'s settings.'); return; }
    at.current = props.offsetMs();
    const s = player.getState().kind;
    resume.current = s === 'playing' || s === 'buffering';
    player.pause();
    used.current = true;
    if (speech) {
      // The speech service sets its own audio session; the player's comes back in `restore`.
      if (!(await speech.start())) { toast('SocialNet needs the microphone — allow it in the phone\'s settings.'); resumeEpisode(); return; }
      setElapsed(0);
    } else {
      await voiceSessionOn();
      await recorder.prepareToRecordAsync();
      recorder.record();
    }
    stopping.current = false;
    discard.current = false;
    setPhase('recording');
  };

  const upload = async (blob: Blob, ms: number, transcript: string | null) => {
    setPhase('posting');
    try {
      await extras.postVoice(props.episodeId, blob, { durationMs: ms, ...(at.current !== undefined ? { offsetMs: at.current } : {}), ...(props.parentId ? { parentId: props.parentId } : {}), ...(transcript ? { transcript } : {}) });
      toast(props.parentId ? 'Voice reply posted.' : 'Voice comment posted.');
      props.onPosted();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.push('/auth/sign-in');
      else if (needsRules(e)) { pending.current = { blob, ms, transcript }; setRules(true); }
      else toast(voicePostError(e));
    }
    setPhase('idle');
    setTake(undefined);
    resumeEpisode();
  };

  // M20 US3: stop the text recorder; "Post" goes to the review, "Cancel" throws it away.
  const stopSpeech = async (post: boolean) => {
    if (!speech || stopping.current) return;
    stopping.current = true;
    if (!post || discard.current) { speech.cancel(); await restore(); setPhase('idle'); resumeEpisode(); return; }
    try {
      const got = await speech.stop();
      await restore();
      if (got.durationMs < 1000) { setPhase('idle'); toast('That was too short — record at least a second.'); resumeEpisode(); return; }
      setTake(got);
      setText(got.text);
      setPhase('review');
    } catch (e) {
      await restore();
      setPhase('idle');
      // iPhone walk 2026-10-06: say why, so a phone failure can be traced.
      console.warn('voice comment failed', e);
      toast(e instanceof Error && e.message ? e.message : "That recording didn't work — try again.");
      resumeEpisode();
    }
  };

  const postTake = async () => {
    if (!take) return;
    const blob = await (await fetch(take.uri)).blob();
    await upload(blob, take.durationMs, text?.trim() ? text.trim() : null);
  };

  const stop = async (post: boolean) => {
    if (speech) { await stopSpeech(post); return; }
    if (stopping.current) return;
    stopping.current = true;
    const ms = Math.min(state.durationMillis, VOICE_MAX_MS);
    await recorder.stop();
    await restore();
    const uri = recorder.uri;
    if (!post || discard.current) { setPhase('idle'); resumeEpisode(); return; }
    if (!uri || ms < 1000) { setPhase('idle'); toast('That was too short — record at least a second.'); resumeEpisode(); return; }
    const blob = await (await fetch(uri)).blob();
    await upload(blob, ms, null);
  };
  // The cap: stop and post at 60 s whatever the listener does.
  useEffect(() => { if (phase === 'recording' && recordedMs >= VOICE_MAX_MS) void stop(true); });

  if (phase === 'idle') {
    const mic = (
      <IconButton
        icon="mic-outline"
        label={props.parentId ? 'Record a voice reply' : 'Record a voice comment'}
        onPress={() => void start()}
        size={22}
      />
    );
    return (
      <Box className="flex-row items-center" style={{ gap: 8 }}>
        <RulesSheet
          open={rules}
          onAccepted={() => { setRules(false); const p = pending.current; pending.current = undefined; if (p) void upload(p.blob, p.ms, p.transcript); }}
          onClose={() => { setRules(false); pending.current = undefined; }}
        />
        {typeof props.children === 'function' ? <Box className="flex-1">{props.children(mic)}</Box> : (<><Box className="flex-1">{props.children}</Box>{mic}</>)}
      </Box>
    );
  }
  if (phase === 'review' && take) {
    return (
      <VoiceTextReview text={text} durationMs={take.durationMs} posting={false}
        postLabel={props.parentId ? 'Post the voice reply' : 'Post the voice comment'}
        onChange={setText} onPost={() => void postTake()}
        onCancel={() => { setTake(undefined); setPhase('idle'); resumeEpisode(); }} />
    );
  }
  const recording = phase === 'recording';
  return (
    <Box className="flex-row items-center bg-raise2" style={BAR} testID="voice-recorder">
      <IconButton icon="close" label="Cancel recording" onPress={() => { discard.current = true; void stop(false); }} disabled={!recording} tone="text2" size={20} />
      {at.current !== undefined ? <Box><TimestampChip text={mmss(at.current)} /></Box> : null}
      <BreathingDot />
      <Box className="flex-1" accessible={false} importantForAccessibility="no-hide-descendants">
        <Curve data={wave} count={COMMENTS.recordBars} height={COMMENTS.voiceHeight} min={3} played={Math.min(1, recordedMs / VOICE_MAX_MS)} />
      </Box>
      <Type step="mono" className="text-text" accessibilityLiveRegion="polite" accessibilityLabel={recording ? `Recording, ${Math.floor(recordedMs / 1000)} seconds of 60` : 'Posting'}>
        {recording ? mmss(recordedMs) : 'Posting…'}
      </Type>
      <IconButton
        icon="checkmark"
        label={speech ? 'Stop recording and check the text' : props.parentId ? 'Stop and post the voice reply' : 'Stop and post the voice comment'}
        onPress={() => void stop(true)}
        disabled={!recording}
        tone="void"
        size={18}
        diameter={COMMENTS.recordCheck}
        className="bg-hot"
      />
    </Box>
  );
}
