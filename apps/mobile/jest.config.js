/**
 * SC-010: the position and interruption logic must reach FULL BRANCH COVERAGE
 * in tests that run with no device. `src/playback/` is held to a hard 100 %
 * branches — a number that fails the build rather than a report nobody reads.
 * Since M25 the rest of src/ is measured too, with its own floor (below).
 *
 * `expo-audio-adapter.ts` lives in here too and is held to the same bar: it is
 * the one file allowed to import `expo-audio`, and its tests mock that module.
 */
const expoPreset = require('jest-expo/jest-preset');

module.exports = {
  preset: 'jest-expo',
  // UniWind and gluestack ship TypeScript/ESM source for React Native, so they are transformed too.
  transformIgnorePatterns: [
    expoPreset.transformIgnorePatterns[0].replace('(?!(', '(?!(uniwind|@gluestack-ui|@legendapp|tailwind-variants|tailwind-merge|'),
    ...expoPreset.transformIgnorePatterns.slice(1),
  ],
  // UniWind (M9, research R1): its Metro resolver and transformer, rebuilt for Jest.
  resolver: './jest.uniwind.resolver.js',
  globalSetup: './jest.uniwind.global.js',
  setupFilesAfterEnv: ['./jest.uniwind.js'],
  // M25 G10: every src file is measured, and the rest of src/ has a floor that only goes up
  // (measured 2026-10-08, run 37746647372, without the two 100 % paths below: statements 55.16,
  // branches 51.67, functions 47.33, lines 57.57). Raise it when coverage rises; never lower it.
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  coverageThreshold: {
    global: { statements: 55.1, branches: 51.6, functions: 47.3, lines: 57.5 },
    './src/playback/': {
      branches: 100,
    },
    // M15 guard G-L1: the launch screen's decision, pure, every branch tested.
    './src/launch/choose.ts': {
      branches: 100,
    },
  },
};
