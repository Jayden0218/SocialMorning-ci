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
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { askMicrophone, useVoiceRecorder, voiceSessionOff, voiceSessionOn } from '@/playback/expo-audio-adapter';
import { usePlayer } from '@/playback/store';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { Icon } from '@/ui/kit/Icon';
import { useColours } from '@/ui/kit/useColours';
import { hit } from '@/design';
import { VOICE_MAX_MS, voiceClock } from '@/social/voice';
import { ApiError } from '@/social/api';
import { useCommentExtrasApi } from '@/social/comment-extras-api';
import { useSocial } from '@/social/context';
import { useToast } from '@/ui/shell/providers';
import { textRecorder, type VoiceTake } from '@/social/voice-text';
import { VoiceTextReview } from './VoiceTextReview';

const DISC = { width: hit.min, height: hit.min };
const TAP = { minHeight: hit.min };
const BAR = { minHeight: 52 };

/** Why a voice comment did not post, in plain words. */
export function voicePostError(e: unknown): string {
  if (e instanceof ApiError && e.status === 503) return 'Voice comments are switched off right now.';
  if (e instanceof ApiError && (e.status === 413 || e.status === 422)) return 'That recording is too long — 60 seconds at most.';
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
  /** The write box: drawn beside the mic, and replaced by the recording bar while recording. */
  children: React.ReactNode;
}): React.ReactElement {
  const c = useColours();
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
    } catch {
      await restore();
      setPhase('idle');
      toast("That recording didn't work — try again.");
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
    return (
      <Box className="flex-row items-center gap-gap">
        <Box className="flex-1">{props.children}</Box>
        <Pressable
          onPress={() => void start()}
          accessibilityRole="button"
          accessibilityLabel={props.parentId ? 'Record a voice reply' : 'Record a voice comment'}
          className="rounded-pill bg-playDisc items-center justify-center"
          style={DISC}
        >
          <Icon name="mic-outline" size={22} color={c.playGlyph} />
        </Pressable>
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
    <Box className="flex-row items-center gap-gap bg-surface border-2 border-primary rounded-pill pl-row pr-1" style={BAR}>
      <Icon name="mic" size={18} color={c.accent} />
      <Text className="text-text text-body font-bold flex-1" accessibilityLiveRegion="polite" accessibilityLabel={recording ? `Recording, ${Math.floor(recordedMs / 1000)} seconds of 60` : 'Posting'}>
        {recording ? voiceClock(recordedMs) : 'Posting…'}
      </Text>
      <Pressable
        onPress={() => { discard.current = true; void stop(false); }}
        disabled={!recording}
        accessibilityRole="button"
        accessibilityLabel="Cancel recording"
        className="justify-center px-row"
        style={TAP}
      >
        <Text className="text-accent text-body font-bold">Cancel</Text>
      </Pressable>
      <Pressable
        onPress={() => void stop(true)}
        disabled={!recording}
        accessibilityRole="button"
        accessibilityLabel={speech ? 'Stop recording and check the text' : props.parentId ? 'Stop and post the voice reply' : 'Stop and post the voice comment'}
        className={`bg-primary rounded-pill justify-center px-section ${recording ? '' : 'opacity-50'}`}
        style={TAP}
      >
        <Text className="text-onPrimary text-body font-bold">{speech ? 'Done' : 'Post'}</Text>
      </Pressable>
    </Box>
  );
}
