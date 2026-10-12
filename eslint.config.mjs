// Lint for correctness only (no formatting rules): see CLAUDE.md "Code style".
import js from '@eslint/js';
import globals from 'globals';

const browserShared = {
  io: 'readonly', Hub: 'writable', CHARACTERS: 'readonly', CHAR: 'readonly',
  esc: 'readonly', shuffle: 'readonly', HuddlePlatform: 'readonly', HUDDLE_CONFIG: 'readonly', tizen: 'readonly',
};

export default [
  { ignores: ['node_modules/', 'dist/', 'android/', 'coverage/'] },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['server/**/*.js', 'test/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
  {
    files: ['public/**/*.js'],
    // TV browsers: webOS 6 (Chromium 79) and Tizen 6 (Chromium 76) are the floor, so no ES2020 (?. ??).
    languageOptions: { ecmaVersion: 2019, sourceType: 'script', globals: { ...globals.browser, ...browserShared } },
  },
];
