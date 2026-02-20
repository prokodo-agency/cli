// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // ── Ignore patterns ──────────────────────────────────────────────────────
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },

  // ── Base JS recommended ───────────────────────────────────────────────────
  js.configs.recommended,

  // ── Source files: TypeScript strict + style ───────────────────────────────
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    extends: [...tseslint.configs.recommended, ...tseslint.configs.stylistic],
    rules: {
      // ── No unused variables (with escape hatches for _prefix) ────────────
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // ── Type safety ───────────────────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'off', // covered by tsc
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',

      // ── Import hygiene ────────────────────────────────────────────────────
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],
      '@typescript-eslint/no-require-imports': 'warn',
      'no-duplicate-imports': 'error',

      // ── Style ─────────────────────────────────────────────────────────────
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': 'warn',
      'no-var': 'error',

      // ── Avoid common mistakes ─────────────────────────────────────────────
      'no-throw-literal': 'error',
      'no-return-assign': 'error',
      'no-sequences': 'error',
      'no-promise-executor-return': 'error',
      'no-unreachable-loop': 'error',

      // ── TS-specific style ─────────────────────────────────────────────────
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/no-inferrable-types': 'error',
    },
  },

  // ── Test files (co-located): same foundation, relaxed for test patterns ──
  {
    files: ['src/**/*.test.ts'],
    extends: [...tseslint.configs.recommended],
    rules: {
      // Allow flexible test patterns
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // The `require('...') as typeof import('...')` pattern is intentional in tests
      '@typescript-eslint/consistent-type-imports': 'off',

      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': 'off', // console.log fine in tests
      'no-duplicate-imports': 'error',
    },
  },

  // ── Prettier: disable all formatting rules that Prettier owns ─────────────
  prettierConfig,
);
