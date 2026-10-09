/**
 * M10b US9: the iPhone's widget, Siri shortcut and lock-screen live activity are OFF unless
 * `SOCIALNET_IOS_EXTRAS=1`. Correction (M21 research R1, 2026-10-06): this said a free Apple team
 * "cannot sign App Groups"; Apple's capability table says it can (developer.apple.com/help/account/
 * reference/supported-capabilities-ios). Neither was ever tried — the first extras build settles
 * it (M21 T023). Cloud build: run ios.yml with the `extras` input; scripts/ios-install.sh now signs
 * each extension with its own profile.
 * Android is not affected either way (both packages are iOS-only; the Android widget is in app.json).
 * M21 US12: the Apple Watch app (`targets/watch`) rides the same switch — `@bacons/apple-targets`
 * links every folder in `targets/`, so the folder is all it needs. Its bundle id is
 * `app.socialmorning.mobile.watchkitapp` (the free team needs a profile for it, research R1).
 */
const APP_GROUP = 'group.app.socialmorning.mobile';

/**
 * Lane DP (2026-10-10): a dev and a prod app that install side by side. `APP_VARIANT=dev` (eas.json's
 * `development` profile, the `variant` input of ci/workflows/ios.yml and android-compile.yml) gives
 * a separate app: its own bundle id / package, name, URL scheme, App Group and a DEV-badged icon
 * (assets/dev/, drawn by scripts/render-dev-icons.mjs). Unset (or `prod`) → exactly today's app;
 * __tests__/app-variant.test.ts holds both to that.
 *
 * The dev app does NOT claim the production link domain: Android's https intent filter (the
 * verified `/c/` clip links on socialmorning-api.vercel.app) is dropped, so a shared clip link
 * still opens the store app. Its API address is `SOCIALNET_DEV_API_BASE_URL`.
 */
const DEV = {
  bundleId: 'app.socialmorning.mobile.dev',
  name: 'SocialNet Dev',
  scheme: 'socialmorning-dev',
  appGroup: 'group.app.socialmorning.mobile.dev',
};
const PROD_LINK_HOST = 'socialmorning-api.vercel.app';

/** `dev` or `prod`; anything else is refused rather than silently built as prod. */
function variantOf(env) {
  const v = env.APP_VARIANT || 'prod';
  if (v !== 'dev' && v !== 'prod') throw new Error(`APP_VARIANT must be "dev" or "prod", not "${v}"`);
  return v;
}

const claimsHost = (filter, host) => (filter.data || []).some((d) => d.host === host);

const withVariant = (config) => {
  if (variantOf(process.env) !== 'dev') return config;
  return {
    ...config,
    name: DEV.name,
    scheme: DEV.scheme,
    icon: './assets/dev/icon.png',
    ios: { ...config.ios, bundleIdentifier: DEV.bundleId },
    android: {
      ...config.android,
      package: DEV.bundleId,
      adaptiveIcon: { ...(config.android && config.android.adaptiveIcon), foregroundImage: './assets/dev/android-icon-foreground.png' },
      intentFilters: ((config.android && config.android.intentFilters) || []).filter((f) => !claimsHost(f, PROD_LINK_HOST)),
    },
    extra: {
      ...config.extra,
      variant: 'dev',
      // The dev app has no backend of its own until the AWS lane builds one: unset, it talks to
      // the PRODUCTION server (today's address in app.json) — sign in with a test account.
      apiBaseUrl: process.env.SOCIALNET_DEV_API_BASE_URL || (config.extra && config.extra.apiBaseUrl),
    },
  };
};

/**
 * The listener journey (specs/015-e2e-journey): `SOCIALNET_API_BASE_URL=http://<mac>:8787 npx expo start`
 * points a Debug build at a local test server, so a real phone can run the journey without ever
 * writing to production. Unset → app.json's production address, exactly as before.
 */
const withApi = (config) => (process.env.SOCIALNET_API_BASE_URL
  ? { ...config, extra: { ...config.extra, apiBaseUrl: process.env.SOCIALNET_API_BASE_URL } }
  : config);

/**
 * M25 L3d (security audit #23, Play policy): `SOCIALNET_DISTRIBUTION=github` marks a build made for
 * GitHub Releases (eas.json's `preview` profile, the APK scripts/release.sh publishes). Only such a
 * build gets `extra.distribution: "github"` — which shows the self-updater (src/ui/shell/updater.ts)
 * — and the REQUEST_INSTALL_PACKAGES permission it needs to open the installer. A store build
 * (`production`) and the CI compile builds have neither.
 */
const withDistribution = (config) => (process.env.SOCIALNET_DISTRIBUTION === 'github'
  ? {
    ...config,
    extra: { ...config.extra, distribution: 'github' },
    android: {
      ...config.android,
      permissions: [...((config.android && config.android.permissions) || []), 'android.permission.REQUEST_INSTALL_PACKAGES'],
    },
  }
  : config);

module.exports = ({ config: base }) => {
  const dev = variantOf(process.env) === 'dev';
  const config = withDistribution(withApi(withVariant(base)));
  const appGroup = dev ? DEV.appGroup : APP_GROUP;
  if (process.env.SOCIALNET_IOS_EXTRAS !== '1') return config;
  return {
    ...config,
    ios: {
      ...config.ios,
      ...(process.env.APPLE_TEAM_ID ? { appleTeamId: process.env.APPLE_TEAM_ID } : {}),
      infoPlist: { ...(config.ios && config.ios.infoPlist), NSSupportsLiveActivities: true },
      entitlements: { ...(config.ios && config.ios.entitlements), 'com.apple.security.application-groups': [appGroup] },
    },
    plugins: [...config.plugins, '@bacons/apple-targets', 'expo-live-activity'],
  };
};
