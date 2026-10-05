// Tests the teen-mode passcode: the SHA-256 vectors, right and wrong tries, the 15-minute wait.
/**
 * M19 T090 (US9, FR-061). The passcode is kept as a salted SHA-256 (src/settings/teen-passcode.ts,
 * written out because the app has no crypto package); 5 wrong tries in a row lock tries for 15
 * minutes; clearing (the email-code reset) removes it.
 *
 * The break that turns it red: in checkPasscode change `fails >= MAX_TRIES` to `fails > MAX_TRIES`.
 */
import { createMemoryStores } from '@/storage/memory';
import { hash } from '@/feeds/hash';
import { checkPasscode, clearPasscode, hasPasscode, isPasscode, LOCK_MS, lockedUntil, setPasscode, sha256 } from '@/settings/teen-passcode';

it('sha256 matches the FIPS 180-4 test vectors', () => {
  expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(sha256('x'.repeat(200))).toBe('aa20c23e3201834050679e1d88941b9a6fed0557c9a705cb2c315e2e63fd486d');
});

it('a passcode is exactly four digits', () => {
  expect(isPasscode('1234')).toBe(true);
  expect(isPasscode('123')).toBe(false);
  expect(isPasscode('12a4')).toBe(false);
});

it('keeps a salted hash, never the digits; the right code passes, a wrong one counts down', () => {
  const { settings } = createMemoryStores(hash);
  expect(hasPasscode(settings)).toBe(false);
  setPasscode(settings, '1234');
  expect(hasPasscode(settings)).toBe(true);
  expect(settings.get('teen.passHash')).not.toContain('1234');
  expect(checkPasscode(settings, '0000', 0)).toEqual({ kind: 'wrong', left: 4 });
  expect(checkPasscode(settings, '1234', 0)).toEqual({ kind: 'ok' });
  expect(checkPasscode(settings, '0000', 0)).toEqual({ kind: 'wrong', left: 4 });
});

it('5 wrong in a row lock tries for 15 minutes, even the right code; then they open again', () => {
  const { settings } = createMemoryStores(hash);
  setPasscode(settings, '1234');
  for (let i = 0; i < 4; i++) checkPasscode(settings, '9999', 1_000);
  expect(checkPasscode(settings, '9999', 1_000)).toEqual({ kind: 'locked', until: 1_000 + LOCK_MS });
  expect(checkPasscode(settings, '1234', 2_000).kind).toBe('locked');
  expect(lockedUntil(settings, 1_000 + LOCK_MS)).toBeUndefined();
  expect(checkPasscode(settings, '1234', 1_000 + LOCK_MS)).toEqual({ kind: 'ok' });
});

it('clearing (the email reset) removes the passcode and the wait', () => {
  const { settings } = createMemoryStores(hash);
  setPasscode(settings, '1234');
  for (let i = 0; i < 5; i++) checkPasscode(settings, '9999', 0);
  clearPasscode(settings);
  expect(hasPasscode(settings)).toBe(false);
  expect(lockedUntil(settings, 1)).toBeUndefined();
});
