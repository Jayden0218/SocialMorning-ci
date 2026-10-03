/**
 * M12 guard G-V2 (FR-104, phone half): a full 60 s recording fits the server's 600 000-byte
 * cap with room for the container, and the clock never runs past 1:00.
 * The break: record with expo-audio's HIGH_QUALITY settings (stereo, 128 kbit/s).
 */
const listeners: ((s: { didJustFinish: boolean }) => void)[] = [];
const mockPlayer = { play: jest.fn(), remove: jest.fn(), addListener: jest.fn((_e: string, f: (s: { didJustFinish: boolean }) => void) => { listeners.push(f); }) };
jest.mock('expo-audio', () => ({
  AudioQuality: { MEDIUM: 64 }, IOSOutputFormat: { MPEG4AAC: 'aac ' },
  createAudioPlayer: jest.fn(() => mockPlayer),
  setAudioModeAsync: jest.fn(async () => undefined),
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: false })),
}));
import { VOICE_MAX_BYTES, VOICE_MAX_MS, expectedBytes, hoursLeft, voiceClock } from '@/voice/recording';
import { askMicrophone, playVoice, voiceOptions, voiceSessionOff, voiceSessionOn } from '@/playback/expo-audio-adapter';
import { setAudioModeAsync } from 'expo-audio';

const VOICE_OPTIONS = voiceOptions();

it('a full minute fits the server cap with 10 % to spare, in one channel', () => {
  expect(VOICE_OPTIONS.numberOfChannels).toBe(1);
  expect(expectedBytes(VOICE_MAX_MS)).toBeLessThan(VOICE_MAX_BYTES * 0.9);
  expect(expectedBytes(VOICE_MAX_MS) * (VOICE_OPTIONS.numberOfChannels ?? 1)).toBe(480_000);
  expect(VOICE_OPTIONS.bitRate).toBe(64_000);
});

it('the clock stops at 1:00; hours left never go negative', () => {
  expect(voiceClock(7_400)).toBe('0:07 / 1:00');
  expect(voiceClock(75_000)).toBe('1:00 / 1:00');
  const now = Date.parse('2026-09-29T10:00:00Z');
  expect(hoursLeft('2026-09-30T09:30:00Z', now)).toBe(24);
  expect(hoursLeft('2026-09-29T09:00:00Z', now)).toBe(0);
});

it('a voice post plays once and reports its end; stop removes the player', () => {
  const onEnd = jest.fn();
  const v = playVoice('https://blob/v.m4a', onEnd);
  expect(mockPlayer.play).toHaveBeenCalled();
  listeners[0]!({ didJustFinish: false });
  expect(onEnd).not.toHaveBeenCalled();
  listeners[0]!({ didJustFinish: true });
  expect(onEnd).toHaveBeenCalledTimes(1);
  v.stop();
  expect(mockPlayer.remove).toHaveBeenCalled();
});

it('recording turns the session to record and back to the player\'s own mode; a refused microphone is false', async () => {
  await voiceSessionOn();
  expect(setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: true, playsInSilentMode: true });
  await voiceSessionOff();
  expect(setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false, shouldPlayInBackground: true, interruptionMode: 'doNotMix', playsInSilentMode: true });
  expect(await askMicrophone()).toBe(false);
});
