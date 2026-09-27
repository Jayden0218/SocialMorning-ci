/**
 * M10b US9: the iPhone's widget, Siri shortcut and lock-screen live activity are OFF unless
 * `SOCIALNET_IOS_EXTRAS=1`. The iPhone build today is signed by a free Apple team, which cannot
 * sign App Groups (the widget needs one), and an unsigned extension would break that build.
 * Turn it on with a paid team: `SOCIALNET_IOS_EXTRAS=1 APPLE_TEAM_ID=… npx expo prebuild -p ios`.
 * Android is not affected either way (both packages are iOS-only; the Android widget is in app.json).
 */
const APP_GROUP = 'group.app.socialmorning.mobile';

module.exports = ({ config }) => {
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
