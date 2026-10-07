// Tests that the lock-screen skip interval (10 s or ±5 min) reaches the lock-screen options.
/**
 * M22 US17 (T072): `setLockScreenSkipSeconds` rides on the lock-screen options as
 * `skipIntervalSeconds` (our expo-audio patch reads it). A mock: whether iOS draws a 300 s
 * button and Android jumps 5 minutes is Tier B, on a phone — NOT VERIFIED here.
 */
import { createExpoAudioAdapter, setLockScreenSkipSeconds } from '@/playback/expo-audio-adapter';

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(async () => undefined),
}));

type Call = { active: boolean; metadata?: unknown; options?: { skipIntervalSeconds?: number } };

function setup() {
  const calls: Call[] = [];
  const player = {
    setActiveForLockScreen: (active: boolean, metadata?: unknown, options?: Call['options']) =>
      calls.push({ active, metadata, options }),
    updateLockScreenMetadata: () => undefined,
    remove: () => undefined,
  };
  const adapter = createExpoAudioAdapter(() => player as never);
  return { calls, adapter };
}

afterEach(() => setLockScreenSkipSeconds(10));

describe('lock-screen skip interval', () => {
  it('asks for 10 s by default', async () => {
    const { calls, adapter } = setup();
    await adapter.execute({ kind: 'setLockScreen', meta: { title: 'E', artist: 'S' } });
    expect(calls[0]?.options?.skipIntervalSeconds).toBe(10);
    adapter.release();
  });

  it('asks for 300 s once ±5 min is chosen before playing', async () => {
    const { calls, adapter } = setup();
    setLockScreenSkipSeconds(300);
    expect(calls).toHaveLength(0); // not on the lock screen yet: nothing to redraw
    await adapter.execute({ kind: 'setLockScreen', meta: { title: 'E', artist: 'S' } });
    expect(calls[0]?.options?.skipIntervalSeconds).toBe(300);
    adapter.release();
  });

  it('redraws the controls with the same metadata when changed while on the lock screen', async () => {
    const { calls, adapter } = setup();
    await adapter.execute({ kind: 'setLockScreen', meta: { title: 'E', artist: 'S' } });
    setLockScreenSkipSeconds(300);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ active: true, metadata: { title: 'E', artist: 'S' }, options: { showSeekForward: true, showSeekBackward: true, skipIntervalSeconds: 300 } });
    setLockScreenSkipSeconds(300); // the same value: nothing
    expect(calls).toHaveLength(2);
    adapter.release();
    setLockScreenSkipSeconds(10); // released: nothing to redraw
    expect(calls).toHaveLength(2);
  });
});
