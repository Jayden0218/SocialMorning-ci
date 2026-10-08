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
  const config = withDistribution(withApi(base));
  if (process.env.SOCIALNET_IOS_EXTRAS !== '1') return config;
  return {
    ...config,
    ios: {
      ...config.ios,
      ...(process.env.APPLE_TEAM_ID ? { appleTeamId: process.env.APPLE_TEAM_ID } : {}),
      infoPlist: { ...(config.ios && config.ios.infoPlist), NSSupportsLiveActivities: true },
      entitlements: { ...(config.ios && config.ios.entitlements), 'com.apple.security.application-groups': [APP_GROUP] },
    },
    plugins: [...config.plugins, '@bacons/apple-targets', 'expo-live-activity'],
  };
};
