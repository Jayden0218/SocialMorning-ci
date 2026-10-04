/** Loads the styles `jest.uniwind.global.js` compiled into UniWind's runtime, per test file. */
const { OUT } = require('./jest.uniwind.global');

require(OUT);

// Before any component, as in index.ts: the class merger must know the app's text sizes.
require('./src/design/merge');
