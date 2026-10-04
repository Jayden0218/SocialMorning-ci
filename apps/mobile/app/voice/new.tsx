// Record a voice post up to 60 seconds for followers; deleted after 48 hours.
/**
 * Record a voice status (M12 FR-104): up to 60 s, heard by people who follow you, deleted by
 * the server after 48 hours. The microphone is used only while the button says "Recording".
 * Episode playback pauses first; the audio session returns to playback when recording ends
 * (with recording allowed, iOS would route sound to the earpiece — expo-audio's AudioMode).
 * The native calls are in src/playback/expo-audio-adapter.ts, the one file that imports expo-audio.
 *
 * M17 T068 (`VoiceNew-B`): the Editorial page — Cancel and the serif title, the three rules as a
 * numbered list, then a white card with the microphone disc beside the clock (large serif time,
 * the 1:00 cap small) and the state line; at the bottom, a bar with the record button as a pill
 * (yellow alone; outlined "Record again" beside a yellow Post once recorded). Same buttons, names
 * and handlers; the 60 s cap, the microphone-refused state and posting unchanged.
 */
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { askMicrophone, useVoiceRecorder, voiceSessionOff, voiceSessionOn } from '@/playback/expo-audio-adapter';
import { Linking } from 'react-native';
import { Pressable } from '@/ui/lib/pressable';
import { Text } from '@/ui/lib/text';
import { Box } from '@/ui/lib/box';
import { ScrollView } from '@/ui/lib/scroll-view';
import { SafeAreaView } from '@/ui/lib/safe-area-view';
import { Card } from '@/ui/kit/Card';
import { hit } from '@/design';
import { Button } from '@/ui/kit/Button';
import { Icon } from '@/ui/kit/Icon';
import { usePlayer } from '@/playback/store';
import { useColours } from '@/ui/kit/useColours';
import { useStores, useToast } from '@/ui/shell/providers';
import { useM12Api } from '@/social/m12-api';
import { ApiError } from '@/social/api';
import { VOICE_MAX_MS, voiceClock } from '@/social/voice';
import { PageHeader } from '@/ui/kit/PageHeader';

/** The old one-line rule, word for word, split into `VoiceNew-B`'s numbered list. */
const RULES = ['Up to 60 seconds.', 'People who follow you can play it', 'for 48 hours; then it is deleted.'] as const;
/** The footer pills: 52 pt in the design, never under 48; the row stretches Post to match. */
const PILL = { minHeight: Math.max(hit.min, 52) };
/** The 40 pt serif clock keeps its line from clipping the serif's figures. */
const CLOCK = { lineHeight: 46 };

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
  // "0:24 / 1:00": the time large, the cap small beside it (`VoiceNew-B`).
  const [clock = '', cap] = voiceClock(shownMs).split(' / ');
  const recorded = phase.kind === 'done' || phase.kind === 'posting';
  return (
    <>
    {/* Phone walk 2026-09-30: the sheet could only be swiped away. M16a T002: Cancel is on the app's own bar. */}
    <PageHeader title="Voice status" left={(
      <Pressable onPress={() => { if (phase.kind === 'recording') void stop(); router.back(); }} accessibilityRole="button" accessibilityLabel="Cancel" className="justify-center px-row" style={{ minHeight: 48 }}>
        <Text className="text-accent text-body font-bold">Cancel</Text>
      </Pressable>
    )} />
    <Box className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerClassName="px-screen-x pt-gap pb-section gap-section">
        <Box className="gap-row">
          {RULES.map((line, i) => (
            <Box key={line} className="flex-row items-center gap-row">
              <Box className="w-7 h-7 rounded-pill bg-accentTint items-center justify-center"><Text className="text-accent text-meta font-bold">{i + 1}</Text></Box>
              <Text className="flex-1 text-text text-body">{line}</Text>
            </Box>
          ))}
        </Box>
        <Card className="py-section flex-row items-center gap-section">
          <Box className={`w-[72px] h-[72px] rounded-pill items-center justify-center ${recording ? 'bg-primary' : 'bg-accentTint'}`}>
            <Icon name={recording ? 'stop' : 'mic-outline'} size={32} color={recording ? c.onPrimary : c.accent} />
          </Box>
          <Box className="flex-1 gap-1">
            <Text className="text-text text-[40px] font-display" style={CLOCK} accessibilityLiveRegion="polite" accessibilityLabel={`${Math.floor(shownMs / 1000)} seconds of 60`}>
              {clock}{cap ? <Text className="text-muted text-base font-display-semibold">{` / ${cap}`}</Text> : null}
            </Text>
            <Text className="text-muted text-meta">{recording ? 'Recording — tap to stop' : phase.kind === 'done' ? 'Tap to record again' : 'Tap to record'}</Text>
          </Box>
        </Card>
        {phase.kind === 'denied' ? (
          <Card className="py-section items-center gap-row">
            <Text className="text-text text-body text-center">SocialNet needs the microphone to record. You can allow it in the phone's settings.</Text>
            <Button kind="secondary" label="Open settings" onPress={() => void Linking.openSettings()} />
          </Card>
        ) : null}
        {error ? <Text className="text-accent text-body text-center">{error}</Text> : null}
      </ScrollView>
      <SafeAreaView edges={['bottom']} className="flex-row items-stretch gap-gap px-screen-x pt-row pb-row border-t-hairline border-separator bg-background">
        <Pressable
          onPress={() => void (recording ? stop() : start())}
          disabled={phase.kind === 'posting'}
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Stop recording' : phase.kind === 'done' ? 'Record again' : 'Start recording'}
          className={`flex-row items-center justify-center gap-2 px-section rounded-pill ${recorded ? 'border border-border bg-surface' : 'flex-1 bg-primary'} ${phase.kind === 'posting' ? 'opacity-40' : ''}`}
          style={PILL}
        >
          <Icon name={recording ? 'stop' : 'mic-outline'} size={18} color={recorded ? c.text : c.onPrimary} />
          <Text className={recorded ? 'text-text text-body font-bold' : 'text-onPrimary text-body font-bold'}>{recording ? 'Stop recording' : recorded ? 'Record again' : 'Start recording'}</Text>
        </Pressable>
        {phase.kind === 'done' || phase.kind === 'posting' ? (
          <Button className="flex-1" label={phase.kind === 'posting' ? 'Posting…' : 'Post'} disabled={phase.kind === 'posting'} onPress={() => void post(phase.uri, phase.ms)} />
        ) : null}
      </SafeAreaView>
    </Box>
    </>
  );
}
