/**
 * SC-010: the position and interruption logic must reach FULL BRANCH COVERAGE
 * in tests that run with no device. `src/playback/` is therefore the only
 * directory coverage is collected from, and the threshold is a hard 100 %
 * branches — a number that fails the build rather than a report nobody reads.
 *
 * `expo-audio-adapter.ts` lives in here too and is held to the same bar: it is
 * the one file allowed to import `expo-audio`, and its tests mock that module.
 */
module.exports = {
  preset: 'jest-expo',
  collectCoverageFrom: ['src/playback/**'],
  coverageThreshold: {
    './src/playback/': {
      branches: 100,
    },
  },
};
