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
module.exports = withUniwindConfig(config, {
  cssEntryFile: './global.css',
  dtsFile: './uniwind-types.d.ts',
});
