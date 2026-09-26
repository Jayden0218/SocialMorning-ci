/** Loads the styles `jest.tailwind.global.js` compiled into NativeWind's runtime. */
const fs = require('node:fs');
const { injectData } = require('react-native-css-interop/dist/runtime/native/styles');
const { OUT } = require('./jest.tailwind.global');

// NativeWind registers View, Text, ScrollView… for `className` only when NODE_ENV is not
// 'test' (wrap-jsx.js). Under jest nothing is registered unless we do it here.
require('react-native-css-interop/dist/runtime/components');

injectData(JSON.parse(fs.readFileSync(OUT, 'utf8')));
