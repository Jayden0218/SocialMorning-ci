/** Loads the styles `jest.tailwind.global.js` compiled into NativeWind's runtime. */
const fs = require('node:fs');
const { injectData } = require('react-native-css-interop/dist/runtime/native/styles');
const { OUT } = require('./jest.tailwind.global');

// NativeWind registers View, Text, ScrollView… for `className` only when NODE_ENV is not
// 'test' (wrap-jsx.js). Under jest nothing is registered unless we do it here.
require('react-native-css-interop/dist/runtime/components');
// …and the ones we register ourselves (Link, LinearGradient, SafeAreaView).
require('./src/design/tailwind');

injectData(JSON.parse(fs.readFileSync(OUT, 'utf8')));

// The Ionicons font (`src/ui/Icon.tsx`) loads asynchronously and re-renders when it
// arrives — under jest that can be after a test file has finished, which threw "import a
// file after the Jest environment has been torn down" (2026-09-27). A plain element with
// the same props stands in; tests still read `name` and `size`.
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { createElement } = require('react');
  const Ionicons = (props) => createElement('Ionicons', props);
  return { __esModule: true, default: Ionicons };
});
