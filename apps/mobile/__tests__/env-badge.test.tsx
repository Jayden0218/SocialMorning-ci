// Checks that the corner badge shows DEV / QA / STAGING for those builds and nothing for the real app.
/**
 * M30 T017 guard. `extra.appEnv` absent or `prod` → nothing is drawn; `qa` → "QA"; `dev` → "DEV"; `staging` → "STAGING".
 * Break: in src/ui/shell/EnvBadge.tsx make LABEL include `prod: 'PROD'` and LOOK a `prod` entry (or make badgeLabel
 * return 'QA' for everything) — the "nothing for prod" test goes red. The app.config.js side is in app-variant.test.ts.
 * How the badge looks on a phone is NOT VERIFIED here.
 */
import { act, create } from 'react-test-renderer';
import { Text as RNText } from 'react-native';
import { badgeLabel, EnvBadge } from '@/ui/shell/EnvBadge';

let mockExtra: Record<string, unknown> | undefined;
jest.mock('expo-constants', () => ({ __esModule: true, default: { get expoConfig() { return { extra: mockExtra }; } } }));

const words = (appEnv?: string): string[] => {
  let r!: ReturnType<typeof create>;
  act(() => { r = create(<EnvBadge appEnv={appEnv} />); });
  const t = r.root.findAllByType(RNText).map((n) => String(n.props.children));
  act(() => r.unmount());
  return t;
};

describe('EnvBadge', () => {
  it('shows nothing for prod, absent or unknown', () => {
    mockExtra = undefined;
    expect(words()).toEqual([]);
    mockExtra = { appEnv: 'prod' };
    expect(words()).toEqual([]);
    mockExtra = { appEnv: 'banana' };
    expect(words()).toEqual([]);
    expect(badgeLabel('prod')).toBeUndefined();
    expect(badgeLabel(undefined)).toBeUndefined();
  });

  it('qa shows QA, dev shows DEV, staging shows STAGING (from the app config)', () => {
    mockExtra = { appEnv: 'qa' };
    expect(words()).toEqual(['QA']);
    mockExtra = { appEnv: 'dev' };
    expect(words()).toEqual(['DEV']);
    mockExtra = { appEnv: 'staging' };
    expect(words()).toEqual(['STAGING']);
  });
});
