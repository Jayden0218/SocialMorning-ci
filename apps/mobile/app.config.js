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
const DEV_APP = {
  bundleId: 'app.socialmorning.mobile.dev',
  name: 'SocialNet Dev',
  scheme: 'socialmorning-dev',
  appGroup: 'group.app.socialmorning.mobile.dev',
};
/**
 * M30 (specs/032-m30-four-environments): `APP_VARIANT=qa` is a third app beside the real one and the dev one — its own
 * bundle id, name, scheme and App Group; it reuses the dev icon (assets/dev, there is no QA icon yet). Like the dev app it
 * reads as `extra.variant: "dev"` inside the app (no real purchases, no production link domain); `extra.appEnv` ('dev' |
 * 'qa') is what the corner badge (src/ui/shell/EnvBadge.tsx) reads. Prod sets neither.
 */
const QA = {
  bundleId: 'app.socialmorning.mobile.qa',
  name: 'SocialMorning QA',
  scheme: 'socialmorning-qa',
  appGroup: 'group.app.socialmorning.mobile.qa',
};
const PROD_LINK_HOST = 'socialmorning-api.vercel.app';

/** `dev`, `qa` or `prod`; anything else is refused rather than silently built as prod. */
function variantOf(env) {
  const v = env.APP_VARIANT || 'prod';
  if (v !== 'dev' && v !== 'qa' && v !== 'prod') throw new Error(`APP_VARIANT must be "dev", "qa" or "prod", not "${v}"`);
  return v;
}

/** True when `url` names the production API host, in any spelling (case, trailing slash, port, path). Only called with an https address. */
const isProdHost = (url) => new URL(url).hostname.toLowerCase() === PROD_LINK_HOST;

const claimsHost = (filter, host) => (filter.data || []).some((d) => d.host === host);

const withVariant = (config) => {
  const variant = variantOf(process.env);
  if (variant === 'prod') return config;
  const ids = variant === 'qa' ? QA : DEV_APP; // the ids of the app being built
  // M30 (P1 + review fix 2): a dev, qa or staging app with no address of its own would quietly talk to PRODUCTION, and an
  // eas.json placeholder (`DEV_API_URL_PLACEHOLDER`) is not an address; refuse both. Only an https address is accepted.
  const url = process.env.SOCIALNET_DEV_API_BASE_URL;
  if (!url) {
    throw new Error(`APP_VARIANT=${variant} needs SOCIALNET_DEV_API_BASE_URL (its own API address); without it the app would use the production API`);
  }
  if (!/^https:\/\/[^\s/]+/.test(url)) {
    throw new Error(`SOCIALNET_DEV_API_BASE_URL must start with https:// and name a host, got "${url}" (a profile placeholder not yet replaced?)`);
  }
  // M30 review round 3: a real https address is still not enough — the production host would make this "dev" app talk to production.
  if (isProdHost(url)) {
    throw new Error('SOCIALNET_DEV_API_BASE_URL is the production API; a dev, qa or staging app must not talk to production');
  }
  return {
    ...config,
    name: ids.name,
    scheme: ids.scheme,
    icon: './assets/dev/icon.png',
    ios: { ...config.ios, bundleIdentifier: ids.bundleId },
    android: {
      ...config.android,
      package: ids.bundleId,
      adaptiveIcon: { ...(config.android && config.android.adaptiveIcon), foregroundImage: './assets/dev/android-icon-foreground.png' },
      intentFilters: ((config.android && config.android.intentFilters) || []).filter((f) => !claimsHost(f, PROD_LINK_HOST)),
    },
    extra: {
      ...config.extra,
      variant: 'dev',
      appEnv: variant,
      apiBaseUrl: url,
    },
  };
};

/**
 * The listener journey (specs/015-e2e-journey): `SOCIALNET_API_BASE_URL=http://<mac>:8787 npx expo start`
 * points a Debug build at a local test server, so a real phone can run the journey without ever
 * writing to production. Unset → app.json's production address, exactly as before.
 */
const withApi = (config) => {
  const url = process.env.SOCIALNET_API_BASE_URL;
  if (!url) return config;
  // M30 review round 2: this override runs AFTER withVariant's https check, so it must not undo it. A dev/qa/staging app takes only an
  // https address that is not the production host; the local journey server (http://<mac>:8787) is for the real (prod) app.
  if (variantOf(process.env) !== 'prod') {
    if (!/^https:\/\/[^\s/]+/.test(url)) {
      throw new Error(`SOCIALNET_API_BASE_URL must start with https:// and name a host for a non-prod app, got "${url}" (a profile placeholder not yet replaced?)`);
    }
    if (isProdHost(url)) {
      throw new Error('SOCIALNET_API_BASE_URL is the production API; a dev, qa or staging app must not talk to production');
    }
  }
  return { ...config, extra: { ...config.extra, apiBaseUrl: url } };
};

/**
 * M25 L3d (security audit #23, Play policy): `SOCIALNET_DISTRIBUTION=github` marks a build made for
 * GitHub Releases (eas.json's `preview` profile, the APK scripts/release.sh publishes). Only such a
 * build gets `extra.distribution: "github"` — which shows the self-updater (src/ui/shell/updater.ts)
 * — and the REQUEST_INSTALL_PACKAGES permission it needs to open the installer. A store build
 * (`production`) and the CI compile builds have neither.
 */
const withDistribution = (config) => (process.env.SOCIALNET_DISTRIBUTION === 'staging'
  // M30 P7: the staging profile builds the dev variant; its corner badge must say STAGING, not DEV.
  ? { ...config, extra: { ...config.extra, appEnv: 'staging' } }
  : process.env.SOCIALNET_DISTRIBUTION === 'github'
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
  const variant = variantOf(process.env);
  const config = withDistribution(withApi(withVariant(base)));
  const appGroup = variant === 'qa' ? QA.appGroup : variant === 'dev' ? DEV_APP.appGroup : APP_GROUP;
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
