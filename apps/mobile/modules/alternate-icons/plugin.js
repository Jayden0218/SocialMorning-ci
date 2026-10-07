/**
 * M22 T076 (moved from M20 T070): the native half of our alternate app icons, at prebuild.
 * The pictures are ours (assets/icons/alt/, drawn by scripts/render-icons.mjs) — never 小宇宙's.
 *
 * iOS: one app icon set per icon in the app's asset catalog (`Images.xcassets/<Name>.appiconset`,
 * a single 1024 image, Xcode 14+), and on the app target only
 * ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES + ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS,
 * so actool writes CFBundleAlternateIcons itself. UIApplication.setAlternateIconName then works.
 *
 * Android: the MAIN/LAUNCHER filter moves off MainActivity onto `.MainActivityDefault`, and each
 * icon gets a disabled `.MainActivity<Name>` alias with its own mipmap; all point at MainActivity,
 * which keeps every other intent filter (deep links, shared clip links). The module switches which
 * alias is enabled.
 */
const { withAndroidManifest, withDangerousMod, withXcodeProject, AndroidConfig } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const ICONS = ['Sunrise', 'Ocean', 'Forest', 'Plum'];
const ASSETS = path.join(__dirname, '..', '..', 'assets', 'icons', 'alt');
const MIPMAPS = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const LAUNCHER = 'android.intent.category.LAUNCHER';

function hasLauncher(filter) {
  return (filter.category || []).some((c) => c.$ && c.$['android:name'] === LAUNCHER);
}

function alias(name, icon, enabled) {
  return {
    $: {
      'android:name': `.MainActivity${name}`,
      'android:targetActivity': '.MainActivity',
      'android:enabled': enabled ? 'true' : 'false',
      'android:exported': 'true',
      'android:icon': icon,
      'android:roundIcon': icon,
    },
    'intent-filter': [{
      action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
      category: [{ $: { 'android:name': LAUNCHER } }],
    }],
  };
}

function withAndroidIcons(config) {
  config = withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    const main = AndroidConfig.Manifest.getMainActivityOrThrow(c.modResults);
    main['intent-filter'] = (main['intent-filter'] || []).filter((f) => !hasLauncher(f));
    const ours = new Set(['Default', ...ICONS].map((n) => `.MainActivity${n}`));
    app['activity-alias'] = (app['activity-alias'] || []).filter((a) => !ours.has(a.$['android:name']));
    app['activity-alias'].push(alias('Default', '@mipmap/ic_launcher', true));
    for (const name of ICONS) app['activity-alias'].push(alias(name, `@mipmap/ic_launcher_${name.toLowerCase()}`, false));
    return c;
  });
  return withDangerousMod(config, ['android', async (c) => {
    const res = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
    for (const [dpi, size] of Object.entries(MIPMAPS)) {
      const dir = path.join(res, `mipmap-${dpi}`);
      fs.mkdirSync(dir, { recursive: true });
      for (const name of ICONS) {
        fs.copyFileSync(path.join(ASSETS, `${name.toLowerCase()}-${size}.png`), path.join(dir, `ic_launcher_${name.toLowerCase()}.png`));
      }
    }
    return c;
  }]);
}

function withIosIcons(config) {
  config = withDangerousMod(config, ['ios', async (c) => {
    const catalog = path.join(c.modRequest.platformProjectRoot, c.modRequest.projectName, 'Images.xcassets');
    for (const name of ICONS) {
      const dir = path.join(catalog, `${name}.appiconset`);
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(path.join(ASSETS, `${name.toLowerCase()}-1024.png`), path.join(dir, 'icon.png'));
      fs.writeFileSync(path.join(dir, 'Contents.json'), JSON.stringify({
        images: [{ filename: 'icon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
        info: { author: 'xcode', version: 1 },
      }, null, 2));
    }
    return c;
  }]);
  return withXcodeProject(config, (c) => {
    const bundleId = c.ios && c.ios.bundleIdentifier;
    const configs = c.modResults.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configs)) {
      const settings = configs[key] && configs[key].buildSettings;
      if (!settings) continue;
      // Only the app target: the widget, Siri and Watch targets have their own bundle ids.
      const id = String(settings.PRODUCT_BUNDLE_IDENTIFIER || '').replace(/"/g, '');
      if (id !== bundleId) continue;
      settings.ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = `"${ICONS.join(' ')}"`;
      settings.ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = 'YES';
    }
    return c;
  });
}

module.exports = function withAlternateIcons(config) {
  return withIosIcons(withAndroidIcons(config));
};
