/** Loads the styles `jest.uniwind.global.js` compiled into UniWind's runtime, per test file. */
const { OUT } = require('./jest.uniwind.global');

require(OUT);
