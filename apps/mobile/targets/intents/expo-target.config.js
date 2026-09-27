/**
 * M10b US9 — Siri: "Play my latest episode in SocialNet". An App Intents extension that opens
 * `socialmorning://play-latest` (app/play-latest.tsx). Linked only when SOCIALNET_IOS_EXTRAS=1.
 * NOT YET COMPILED — no paid team or Mac build exists for it.
 */
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'app-intent',
  name: 'SocialNetIntents',
  deploymentTarget: '18.0',
  frameworks: ['AppIntents'],
};
