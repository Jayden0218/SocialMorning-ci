/**
 * M10b (2026-09-27, owner "go"): Android Auto. A podcast app appears in the car through a
 * browsable media service (developer.android.com/training/cars/media). expo-audio's own
 * AudioControlsService is that service once `patches/expo-audio+58.0.0.patch` makes it a
 * Media3 MediaLibraryService; this plugin does the manifest half:
 *   - the service is exported (the car is another app) and answers the two browse actions;
 *   - `automotive_app_desc.xml` tells Android Auto this is a media app.
 * It works whether expo-audio's plugin has already written the service or not.
 */
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SERVICE = 'expo.modules.audio.service.AudioControlsService';
const ACTIONS = [
  'androidx.media3.session.MediaSessionService',
  'androidx.media3.session.MediaLibraryService',
  'android.media.browse.MediaBrowserService',
];

function withAndroidAuto(config) {
  config = withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    app.service = app.service || [];
    let svc = app.service.find((s) => s.$ && s.$['android:name'] === SERVICE);
    if (!svc) {
      svc = { $: { 'android:name': SERVICE, 'android:foregroundServiceType': 'mediaPlayback' }, 'intent-filter': [] };
      app.service.push(svc);
    }
    svc.$['android:exported'] = 'true';
    svc['intent-filter'] = svc['intent-filter'] && svc['intent-filter'].length > 0 ? svc['intent-filter'] : [{ action: [] }];
    const filter = svc['intent-filter'][0];
    filter.action = filter.action || [];
    for (const name of ACTIONS) {
      if (!filter.action.some((a) => a.$ && a.$['android:name'] === name)) filter.action.push({ $: { 'android:name': name } });
    }
    app['meta-data'] = (app['meta-data'] || []).filter((m) => m.$['android:name'] !== 'com.google.android.gms.car.application');
    app['meta-data'].push({ $: { 'android:name': 'com.google.android.gms.car.application', 'android:resource': '@xml/automotive_app_desc' } });
    return c;
  });
  config = withDangerousMod(config, ['android', async (c) => {
    const dir = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'automotive_app_desc.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<automotiveApp>\n  <uses name="media" />\n</automotiveApp>\n');
    return c;
  }]);
  return config;
}

module.exports = withAndroidAuto;
