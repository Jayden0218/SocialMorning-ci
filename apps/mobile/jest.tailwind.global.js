/**
 * Jest has no Metro, so nothing turns `className` into styles unless we do it here.
 *
 * Once per run: compile every class in `app/` and `src/` with the real
 * `tailwind.config.ts`, convert it the way NativeWind's Metro plugin does, and write the
 * result where `jest.tailwind.js` loads it into each test file. So a test that reads
 * `props.style` (the scrubber's width, a text's colour, a row's min height) reads what
 * the phone would get. Without this, those tests would see `{}` and go quietly blind.
 */
const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const loadConfig = require('tailwindcss/loadConfig');
const { cssToReactNativeRuntime } = require('react-native-css-interop/dist/css-to-rn');
const { cssToReactNativeRuntimeOptions } = require('nativewind/dist/metro/common');

/** The same rem as the phone (see metro.config.js); NativeWind's own default is 14. */
const REM = 16;

const OUT = path.join(__dirname, 'node_modules', '.cache', 'tailwind-jest.json');

module.exports = async () => {
  // Metro sets this; without it `hairlineWidth()` in the config compiles to a flat 1px.
  process.env.NATIVEWIND_OS ??= 'android';
  const config = loadConfig(path.join(__dirname, 'tailwind.config.ts'));
  const { css } = await postcss([
    tailwind({ ...config, content: [path.join(__dirname, '{app,src}/**/*.{ts,tsx}')] }),
  ]).process('@tailwind base;@tailwind components;@tailwind utilities;', { from: undefined });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(cssToReactNativeRuntime(css, { ...cssToReactNativeRuntimeOptions, inlineRem: REM })));
};
module.exports.OUT = OUT;
