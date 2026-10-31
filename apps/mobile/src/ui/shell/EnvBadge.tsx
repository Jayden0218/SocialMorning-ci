// A small corner badge saying which environment this build talks to (DEV, QA or STAGING); nothing in the real app.
/**
 * M30 (specs/032-m30-four-environments, T017): `app.config.js` writes `extra.appEnv` = `dev` | `qa` for those
 * variants, and `staging` for the staging EAS profile (SOCIALNET_DISTRIBUTION=staging, which builds the dev variant). The real app has no such field,
 * so it shows nothing. Unknown values show nothing too.
 */
import Constants from 'expo-constants';
import { Box } from '@/ui/lib/box';
import { Type } from '@/ui/kit/Type';

const LABEL: Record<string, string> = { dev: 'DEV', qa: 'QA', staging: 'STAGING' };
// QA is the primary fill with its own words (text-onPrimary); DEV and STAGING take other palette roles with text-background words.
const LOOK: Record<string, { box: string }> = {
  dev: { box: 'bg-text' },
  qa: { box: 'bg-primary' },
  staging: { box: 'bg-accent' },
};

/** The badge words for an `extra.appEnv` value, or undefined for prod, absent or unknown. */
export function badgeLabel(appEnv: unknown): string | undefined {
  return typeof appEnv === 'string' ? LABEL[appEnv] : undefined;
}

export function EnvBadge({ appEnv }: { appEnv?: string }): React.ReactElement | null {
  const env = appEnv ?? (Constants.expoConfig?.extra as { appEnv?: string } | undefined)?.appEnv;
  const label = badgeLabel(env);
  if (!label || !env) return null;
  const look = LOOK[env]!;
  return (
    <Box className="absolute right-0 top-0 z-50" pointerEvents="none">
      <Box className={`${look.box} rounded-bl-md px-gap py-hair`}>
        <Type step="badge" className={env === 'qa' ? 'text-onPrimary' : 'text-background'} accessibilityLabel={`${label} environment`}>{label}</Type>
      </Box>
    </Box>
  );
}
