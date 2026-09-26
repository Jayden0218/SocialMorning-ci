/** Loads the styles `jest.tailwind.global.js` compiled into NativeWind's runtime. */
const fs = require('node:fs');
const { injectData } = require('react-native-css-interop/dist/runtime/native/styles');
const { OUT } = require('./jest.tailwind.global');

injectData(JSON.parse(fs.readFileSync(OUT, 'utf8')));
