/**
 * @jest-environment node
 */
// expo-asset must get the real react-native, or no font ever loads (038 M2, FR-002; the cause M0 read in run 41934113529).
/**
 * Uniwind's Metro resolver sends every `import 'react-native'` (outside react-native itself) to `uniwind/components`, a fixed list of names that has
 * no `AssetRegistry`. expo-asset does `import { AssetRegistry } from 'react-native'`, so `getAssetByID` was read from undefined, `loadAsync` rejected,
 * and all ten faces were dropped: "[fonts] failed: Cannot read property 'getAssetByID' of undefined" at every launch of the Release simulator build.
 * Screens keep the Uniwind components (that is how `className` works); only expo-asset gets the real module.
 * The break that turns it red: remove the expo-asset exception from metro.config.js.
 */
import path from 'node:path';

const MOBILE = path.join(__dirname, '..');
type Ctx = { originModulePath: string; resolveRequest: (c: Ctx, name: string, platform: string | null) => { type: 'sourceFile'; filePath: string } };
// A stand-in for Metro's own resolver: every module resolves to /r/<name>, except that react-native resolves to a file inside react-native.
const ctx = (origin: string): Ctx => ({
  originModulePath: origin,
  resolveRequest: (_c, name) => ({ type: 'sourceFile', filePath: name === 'react-native' ? '/m/node_modules/react-native/index.js' : `/m/node_modules/${name}/index.js` }),
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require(path.join(MOBILE, 'metro.config.js')) as { resolver: { resolveRequest: (c: Ctx, name: string, platform: string | null) => { filePath: string } } };
const resolve = (origin: string) => config.resolver.resolveRequest(ctx(origin), 'react-native', 'ios').filePath;

it('expo-asset gets the real react-native (it needs AssetRegistry)', () => {
  expect(resolve('/m/node_modules/expo-asset/build/Asset.js')).toBe('/m/node_modules/react-native/index.js');
  expect(resolve('/m/node_modules/expo-asset/build/resolveAssetSource.js')).toBe('/m/node_modules/react-native/index.js');
});

it('a screen still gets the Uniwind components, so className keeps working', () => {
  expect(resolve('/m/app/index.tsx')).toContain('uniwind/components');
  expect(resolve('/m/src/ui/kit/Type.tsx')).toContain('uniwind/components');
});
