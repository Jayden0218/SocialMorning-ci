// Tests the voice text recorder against a fake speech service: the text, the fallbacks, the encode.
/**
 * M20 US3 (spec FR-006–FR-008; research R1). Logic only, with a fake ExpoSpeechRecognition and a
 * fake encoder — real speech on a phone is quickstart B4/B5, NOT VERIFIED.
 */
import { createTranscript, textRecorder, type SpeechModule } from '@/social/voice-text';

type Listener = (e: never) => void;
function fakeSpeech(opts: { recording?: boolean; available?: boolean; granted?: boolean } = {}) {
  const listeners = new Map<string, Listener[]>();
  const started: Record<string, unknown>[] = [];
  let aborted = false;
  const emit = (name: string, e: unknown) => { for (const l of listeners.get(name) ?? []) l(e as never); };
  const m: SpeechModule = {
    start: (o) => void started.push(o),
    stop: () => { emit('result', { results: [{ transcript: 'world' }], isFinal: true }); emit('audioend', { uri: 'file:///cache/rec.wav' }); emit('end', {}); },
    abort: () => { aborted = true; },
    supportsRecording: () => opts.recording ?? true,
    isRecognitionAvailable: () => opts.available ?? true,
    requestPermissionsAsync: async () => ({ granted: opts.granted ?? true }),
    addListener: (name, fn) => { listeners.set(name, [...(listeners.get(name) ?? []), fn as Listener]); return { remove: () => listeners.set(name, (listeners.get(name) ?? []).filter((x) => x !== fn)) }; },
  };
  return { m, emit, started, wasAborted: () => aborted, count: () => [...listeners.values()].reduce((n, l) => n + l.length, 0) };
}

it('the transcript: final segments in order, then the unfinished one; nothing heard is null', () => {
  const t = createTranscript();
  expect(t.text()).toBeNull();
  t.result({ results: [{ transcript: 'hello' }], isFinal: false });
  t.result({ results: [{ transcript: 'hello there' }], isFinal: true });
  t.result({ results: [{ transcript: 'second' }], isFinal: false });
  expect(t.text()).toBe('hello there second');
});

it('records with text: persists the audio, encodes it, returns the text and the length', async () => {
  const f = fakeSpeech();
  let clock = 1_000;
  const encoded: string[] = [];
  const r = textRecorder({ speech: f.m, encode: async (uri) => { encoded.push(uri); return { uri: 'file:///cache/voice.m4a', bytes: 160_000 }; }, now: () => clock, lang: 'en-MY' })!;
  expect(await r.start()).toBe(true);
  expect(f.started[0]).toMatchObject({ lang: 'en-MY', continuous: true, interimResults: true, recordingOptions: { persist: true } });
  f.emit('result', { results: [{ transcript: 'hello' }], isFinal: true });
  clock += 20_000;
  expect(r.elapsedMs()).toBe(20_000);
  const take = await r.stop();
  expect(take).toEqual({ uri: 'file:///cache/voice.m4a', bytes: 160_000, durationMs: 20_000, text: 'hello world' });
  expect(encoded).toEqual(['file:///cache/rec.wav']);
  expect(f.count()).toBe(0);
});

it('FR-008: no recording support, no service or no native module → undefined, so the old recorder is used', () => {
  expect(textRecorder({ speech: fakeSpeech({ recording: false }).m, encode: async () => ({ uri: '', bytes: 0 }) })).toBeUndefined();
  expect(textRecorder({ speech: fakeSpeech({ available: false }).m, encode: async () => ({ uri: '', bytes: 0 }) })).toBeUndefined();
  expect(textRecorder({ speech: null, encode: async () => ({ uri: '', bytes: 0 }) })).toBeUndefined();
  expect(textRecorder({ speech: fakeSpeech().m, encode: null })).toBeUndefined();
});

it('permission refused → start says so; cancel aborts and lets go of the listeners', async () => {
  expect(await textRecorder({ speech: fakeSpeech({ granted: false }).m, encode: async () => ({ uri: '', bytes: 0 }) })!.start()).toBe(false);
  const f = fakeSpeech();
  const r = textRecorder({ speech: f.m, encode: async () => ({ uri: '', bytes: 0 }) })!;
  await r.start();
  r.cancel();
  expect(f.wasAborted()).toBe(true);
  expect(f.count()).toBe(0);
});

it('a length over 60 s is reported as 60 s', async () => {
  let clock = 0;
  const r = textRecorder({ speech: fakeSpeech().m, encode: async () => ({ uri: 'u', bytes: 1 }), now: () => clock })!;
  await r.start();
  clock = 75_000;
  expect((await r.stop()).durationMs).toBe(60_000);
});
