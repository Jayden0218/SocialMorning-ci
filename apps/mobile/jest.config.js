/**
 * SC-010: the position and interruption logic must reach FULL BRANCH COVERAGE
 * in tests that run with no device. `src/playback/` is therefore the only
 * directory coverage is collected from, and the threshold is a hard 100 %
 * branches — a number that fails the build rather than a report nobody reads.
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
  collectCoverageFrom: ['src/playback/**', 'src/launch/choose.ts'],
  coverageThreshold: {
    './src/playback/': {
      branches: 100,
    },
    // M15 guard G-L1: the launch screen's decision, pure, every branch tested.
    './src/launch/choose.ts': {
      branches: 100,
    },
  },
};
