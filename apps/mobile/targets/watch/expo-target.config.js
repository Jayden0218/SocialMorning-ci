/**
 * M21 US12 (FR-105, research R1) — the Apple Watch app. Linked only when SOCIALNET_IOS_EXTRAS=1
 * (app.config.js adds `@bacons/apple-targets`, which picks up every folder in `targets/`, so this
 * folder is all it takes). Owner, G0 (2026-10-06): SwiftUI is allowed ON THE WATCH ONLY, in our
 * colours (Theme.swift, checked against src/design/tokens.ts by __tests__/m21-watch.test.ts) and
 * our English words.
 *
 * - `type: 'watch'`: a single-target watchOS app embedded in the phone app ("Embed Watch Content").
 *   The library sets WKCompanionAppBundleIdentifier to the phone's bundle id by itself.
 * - Bundle id `app.socialmorning.mobile.watchkitapp`: a watch app's id must start with the phone's.
 * - Info.plist (this folder; the library leaves an existing one alone): UIBackgroundModes audio
 *   and WKApplication.
 * - App Group: the phone's group. Not used for data (WatchConnectivity carries everything); kept so
 *   the watch's profile carries the same capability as the phone's.
 * NOT YET COMPILED — the cloud ios.yml run with extras on is the first compile (T127).
 */
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'watch',
  name: 'SocialNetWatch',
  displayName: 'SocialNet',
  bundleIdentifier: '.watchkitapp',
  deploymentTarget: '10.0',
  frameworks: ['SwiftUI', 'AVFoundation', 'WatchConnectivity', 'WatchKit'],
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
