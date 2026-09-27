/**
 * M10b US9 — the iPhone home-screen widget + the live activity's lock-screen view. Linked only
 * when SOCIALNET_IOS_EXTRAS=1 (see app.config.js): it needs the App Group, which a free Apple
 * team cannot sign. NOT YET COMPILED — no paid team or Mac build exists for it.
 */
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'NowPlayingWidget',
  displayName: 'SocialNet',
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
