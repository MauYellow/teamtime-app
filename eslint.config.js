// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Gli import "@/..." sono già verificati da TypeScript (tsc).
    files: ['**/*.ts', '**/*.tsx'],
    rules: { 'import/no-unresolved': 'off' },
  },
]);
