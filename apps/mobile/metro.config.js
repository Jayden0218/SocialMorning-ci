const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

// M27 (specs/031-m29-screen-capture, research R5): the capture pass builds the app for the WEB, where
// expo-sqlite has no wasm and expo-secure-store has no keychain. With M27_WEB=1 (and only then) those
// modules are replaced by the shims in __tests__/fixtures/m27/web-shims. A phone build never sets it
// (scripts/capture-coverage.test.mjs asserts the alias is off without it).
if (process.env.M27_WEB === '1') {
  const shims = path.join(__dirname, '__tests__', 'fixtures', 'm27', 'web-shims');
  const swaps = {
    '@/storage/sqlite': path.join(shims, 'sqlite.ts'),
    'expo-secure-store': path.join(shims, 'secure-store.ts'),
  };
  const previous = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform === 'web' && swaps[moduleName]) return { type: 'sourceFile', filePath: swaps[moduleName] };
    return (previous ?? context.resolveRequest)(context, moduleName, platform);
  };
}

// UniWind must be the outermost wrapper (docs.uniwind.dev/quickstart).
const uniwindConfig = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts',
});

// 038 M2 (FR-002): UniWind sends every `import 'react-native'` outside react-native itself to `uniwind/components`, a fixed list of names without
// `AssetRegistry`. expo-asset imports `AssetRegistry` from 'react-native', so `loadAsync` threw "Cannot read property 'getAssetByID' of undefined"
// and none of the ten fonts ever loaded (run 41934113529's app log). expo-asset gets the real module; screens keep the UniWind components.
const withUniwind = uniwindConfig.resolver.resolveRequest;
uniwindConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native' && context.originModulePath.includes(`${path.sep}node_modules${path.sep}expo-asset${path.sep}`)) {
    return context.resolveRequest(context, moduleName, platform);
  }
  return withUniwind(context, moduleName, platform);
};

module.exports = uniwindConfig;
