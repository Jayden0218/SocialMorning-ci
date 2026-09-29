/**
 * Record a voice status (M12 FR-104): up to 60 s, heard by people who follow you, deleted by
 * the server after 48 hours. The microphone is used only while the button says "Recording".
 * Episode playback pauses first; the audio session returns to playback when recording ends
 * (with recording allowed, iOS would route sound to the earpiece — expo-audio's AudioMode).
 * The native calls are in src/playback/expo-audio-adapter.ts, the one file that imports expo-audio.
 */
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { askMicrophone, useVoiceRecorder, voiceSessionOff, voiceSessionOn } from '../../src/playback/expo-audio-adapter';
import { Linking } from 'react-native';
import { Pressable } from '../../src/ui/lib/pressable';
import { Text } from '../../src/ui/lib/text';
import { Box } from '../../src/ui/lib/box';
import { Screen } from '../../src/ui/Screen';
import { Button } from '../../src/ui/Button';
import { Icon } from '../../src/ui/Icon';
import { usePlayer } from '../../src/playback/store';
import { useColours } from '../../src/ui/useColours';
import { useStores, useToast } from '../../src/ui/providers';
import { useM12Api } from '../../src/social/m12-api';
import { ApiError } from '../../src/social/api';
import { VOICE_MAX_MS, voiceClock } from '../../src/voice/recording';

type Phase = { kind: 'idle' } | { kind: 'denied' } | { kind: 'recording' } | { kind: 'done'; uri: string; ms: number } | { kind: 'posting'; uri: string; ms: number };

export default function NewVoicePost(): React.ReactElement {
  const stores = useStores();
  const c = useColours(stores.settings);
  const toast = useToast();
  const player = usePlayer();
  const m12 = useM12Api();
  const { recorder, state } = useVoiceRecorder();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | undefined>();
  const stopping = useRef(false);

  const restore = () => voiceSessionOff().catch(() => undefined);
  useEffect(() => () => { void restore(); }, []);

  const start = async () => {
    setError(undefined);
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
    const ms = Math.min(state.durationMillis, VOICE_MAX_MS);
    await recorder.stop();
    await restore();
    if (recorder.uri && ms >= 1000) setPhase({ kind: 'done', uri: recorder.uri, ms });
    else { setPhase({ kind: 'idle' }); setError('That was too short — hold on for at least a second.'); }
  };
  // The cap: stop at 60 s whatever the listener does.
  useEffect(() => { if (phase.kind === 'recording' && state.durationMillis >= VOICE_MAX_MS) void stop(); });

  const post = async (uri: string, ms: number) => {
    setPhase({ kind: 'posting', uri, ms });
    try {
      const blob = await (await fetch(uri)).blob();
      await m12.postVoice(blob, ms);
      toast('Posted. It disappears in 48 hours.');
      router.back();
    } catch (e) {
      setPhase({ kind: 'done', uri, ms });
      setError(e instanceof ApiError && e.status === 429 ? 'You already have 5 live voice posts.' : e instanceof ApiError && e.status === 503 ? 'Voice posts are switched off right now.' : "That didn't post — try again.");
    }
  };

  const recording = phase.kind === 'recording';
  const shownMs = recording ? state.durationMillis : phase.kind === 'done' || phase.kind === 'posting' ? phase.ms : 0;
  return (
    <Screen className="pt-section items-center gap-section">
      <Stack.Screen options={{ title: 'Voice status' }} />
      <Text className="text-muted text-sm text-center">Up to 60 seconds. People who follow you can play it for 48 hours; then it is deleted.</Text>
      <Text className="text-text text-2xl font-bold" accessibilityLiveRegion="polite" accessibilityLabel={`${Math.floor(shownMs / 1000)} seconds of 60`}>{voiceClock(shownMs)}</Text>
      <Pressable
        onPress={() => void (recording ? stop() : start())}
        disabled={phase.kind === 'posting'}
        accessibilityRole="button"
        accessibilityLabel={recording ? 'Stop recording' : phase.kind === 'done' ? 'Record again' : 'Start recording'}
        className={`w-24 h-24 rounded-pill items-center justify-center ${recording ? 'bg-primary' : 'bg-accentTint'}`}
      >
        <Icon name={recording ? 'stop' : 'mic'} size={40} color={recording ? c.onPrimary : c.accent} />
      </Pressable>
      <Text className="text-muted text-xs">{recording ? 'Recording — tap to stop' : phase.kind === 'done' ? 'Tap to record again' : 'Tap to record'}</Text>
      {phase.kind === 'denied' ? (
        <Box className="items-center gap-row">
          <Text className="text-text text-sm text-center">SocialNet needs the microphone to record. You can allow it in the phone's settings.</Text>
          <Button kind="secondary" label="Open settings" onPress={() => void Linking.openSettings()} />
        </Box>
      ) : null}
      {error ? <Text className="text-accent text-sm text-center">{error}</Text> : null}
      {phase.kind === 'done' || phase.kind === 'posting' ? (
        <Box className="self-stretch mt-section">
          <Button label={phase.kind === 'posting' ? 'Posting…' : 'Post'} disabled={phase.kind === 'posting'} onPress={() => void post(phase.uri, phase.ms)} />
        </Box>
      ) : null}
    </Screen>
  );
}
