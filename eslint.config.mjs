// M32 T021 (review finding D1): the first lint for the whole repo. Flat config, run from the root: `npm run lint`.
// rules-of-hooks is an error (a conditional hook call is a crash waiting for a device); exhaustive-deps and everything else are warnings,
// so the first run is honestly green and the warning count is the number to bring down.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

/** Turn every rule of a config into a warning (react-hooks stays at error below). */
const warnAll = (rules) => Object.fromEntries(Object.entries(rules ?? {}).map(([k, v]) => [k, Array.isArray(v) ? ['warn', ...v.slice(1)] : v === 0 || v === 'off' ? v : 'warn']));

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**', '**/dist/**', '**/dist-lambda/**', '**/build/**', '**/.expo/**', '**/.vercel/**', '**/coverage/**',
      '**/ios/**', '**/android/**', '**/*.d.ts', '**/*.tsbuildinfo', '**/generated/**', '**/*.generated.*', 'apps/mobile/patches/**', 'patches/**',
      'apps/mobile/modules/**/build/**', 'specs/**', 'docs/**', 'research/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,jsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser }, ecmaVersion: 'latest', sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'warn' },
  },
  {
    // Warnings for everything the recommended sets add; the rules we care about most are set to error right after.
    files: ['**/*.{js,mjs,cjs,ts,tsx,jsx}'],
    rules: warnAll({ ...js.configs.recommended.rules, ...Object.assign({}, ...tseslint.configs.recommended.map((c) => c.rules ?? {})) }),
  },
  {
    files: ['**/*.{ts,tsx,jsx}'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn', // 8 hits on the first run; raise to error once they are fixed
      ...warnAll(jsxA11y.flatConfigs.recommended.rules),
    },
  },
  {
    // Playwright fixtures call their `use(...)` callback; the hooks rule reads that name as a React hook.
    files: ['apps/studio/e2e/**/*.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
);
