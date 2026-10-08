/** Jest config for the pure Masters rules engine (jest-expo preset). */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|react-native-reanimated)',
    // @wms/domain resolves to a real path OUTSIDE this project (sibling repo, symlinked via
    // `file:../wms_domain`), so its realpath never contains "node_modules" and the pattern
    // above never matches it — Jest would otherwise try to Babel-transform its already-compiled
    // (plain tsc/CommonJS) dist/ output, which needs no transform and pulls in a
    // @babel/runtime helper that isn't installed in the sibling repo's own node_modules.
    '/wms_domain/dist/',
  ],
};
