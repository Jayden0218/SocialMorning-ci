/**
 * M9 (research R1). Jest has no Metro, so it has none of UniWind's Metro resolver.
 * This does the same two things that resolver does (uniwind 1.12.0,
 * src/bundler/adapters/metro/resolvers.ts), on top of React Native's own Jest resolver:
 *  - an app import of `react-native` gets `uniwind/components`, whose View/Text/… read
 *    `className`; UniWind's own files and React Native's own files keep the real one;
 *  - UniWind's source uses an `@/` alias for its own `src/`, which its build resolves.
 *
 * RN's preset maps `^react-native($|/.*)` to its directory BEFORE any resolver runs, so a
 * bare `react-native` arrives here as that directory path, not by name.
 */
const path = require('node:path');
const rnResolver = require('@react-native/jest-preset/jest/resolver.js');

const UNIWIND = path.dirname(require.resolve('uniwind/package.json'));
const RN_DIR = path.dirname(require.resolve('react-native/package.json'));
const RN_INTERNAL = /[\\/]node_modules[\\/](react-native|@react-native)[\\/]/;
const APP_SRC = path.join(__dirname, 'src');
const COMPONENTS = path.join(UNIWIND, 'src', 'components', 'index.ts');

const isBareReactNative = (request) =>
  request === 'react-native' || path.resolve(request) === RN_DIR;

module.exports = (request, options) => {
  const from = options.basedir + path.sep;
  const inUniwind = from.startsWith(UNIWIND + path.sep);
  if (inUniwind && request.startsWith('@/')) {
    return rnResolver(path.join(UNIWIND, 'src', request.slice(2)), options);
  }
  // The app's own `@/` alias (tsconfig `paths`): `@/ui/kit/Button` → src/ui/kit/Button.
  // Only for app files — a package's `@/` (UniWind's, above) means its own src/.
  if (request.startsWith('@/') && !from.includes(`${path.sep}node_modules${path.sep}`)) {
    return rnResolver(path.join(APP_SRC, request.slice(2)), options);
  }
  if (isBareReactNative(request) && !inUniwind && !RN_INTERNAL.test(from)) {
    return COMPONENTS;
  }
  // Metro picks the package's `react-native` export (src/index.ts); Jest would pick the
  // `default` one (dist). Two copies would mean two style stores — use the one Metro uses.
  if (request === 'uniwind') {
    return path.join(UNIWIND, 'src', 'index.ts');
  }
  return rnResolver(request, options);
};
