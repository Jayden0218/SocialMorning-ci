// Says which app this build is — the dev app or the real (prod) one — from the app config.
/**
 * Lane DP: `APP_VARIANT=dev` builds a second app that installs beside the real one
 * (app.config.js). It writes `extra.variant: "dev"`; the real app has no such field, so anything
 * else reads as prod.
 */
import Constants from 'expo-constants';

export type AppVariant = 'dev' | 'prod';

/** `dev` only when the config says so; prod otherwise. */
export function variantOf(extra: Record<string, unknown> | undefined | null): AppVariant {
  return extra?.['variant'] === 'dev' ? 'dev' : 'prod';
}

/** This build's variant. */
export function appVariant(): AppVariant {
  return variantOf((Constants.expoConfig?.extra ?? undefined) as Record<string, unknown> | undefined);
}
