/**
 * M21 US2: the share panel's row of chat apps asks `Linking.canOpenURL` whether each is installed.
 * On Android 11+ that answers only for apps the manifest declares in `<queries>` (package
 * visibility); this adds one VIEW intent per scheme. The list must match `SHARE_SCHEMES` in
 * src/ui/clips/share-targets.ts — __tests__/share-targets.test.ts checks it. (iOS: app.json
 * `ios.infoPlist.LSApplicationQueriesSchemes`.)
 */
const { withAndroidManifest } = require('expo/config-plugins');

const SCHEMES = ['whatsapp', 'tg', 'weixin', 'sms', 'twitter'];

function withShareQueries(config) {
  return withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    manifest.queries = manifest.queries && manifest.queries.length > 0 ? manifest.queries : [{}];
    const q = manifest.queries[0];
    q.intent = q.intent || [];
    for (const scheme of SCHEMES) {
      const has = q.intent.some((i) => (i.data || []).some((d) => d.$ && d.$['android:scheme'] === scheme));
      if (!has) q.intent.push({ action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }], data: [{ $: { 'android:scheme': scheme } }] });
    }
    return c;
  });
}

module.exports = withShareQueries;
module.exports.SCHEMES = SCHEMES;
