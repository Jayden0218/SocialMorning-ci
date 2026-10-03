/** M12 guard G-B11 (B11): an empty Downloads said "Used 1 MB". The break: floor 0 bytes at 1 MB again. */
jest.mock('../src/ui/providers', () => ({ useDownloads: () => ({}), useToast: () => () => undefined, useStores: () => ({}) }));
import { mb } from '../src/ui/DownloadButton';

it('nothing downloaded is 0 MB; a little is at least 1 MB', () => {
  expect(mb(0)).toBe('0 MB');
  expect(mb(200_000)).toBe('1 MB');
  expect(mb(5 * 1024 * 1024)).toBe('5 MB');
  expect(mb(undefined)).toBe('');
});
