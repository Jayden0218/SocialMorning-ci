const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/**
 * NativeWind's default is 1rem = 14 px, which silently shrinks every Tailwind size:
 * `p-4` became 14 and `rounded-3xl` 21. At 16, `p-4` is 16 as on the web.
 * `jest.tailwind.global.js` reads this same number, so the tests see what the phone does.
 */
const REM = 16;

module.exports = withNativeWind(getDefaultConfig(__dirname), { input: './global.css', inlineRem: REM });
