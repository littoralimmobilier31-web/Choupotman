import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

/**
 * ESLint 9 flat config.
 *
 * Next's shareable configs are still written for the old format, so they are
 * brought in through `FlatCompat` rather than rewritten by hand — that keeps the
 * rules Next actually ships, instead of an approximation of them that drifts.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'data/**',
      'public/sw.js',
      'next-env.d.ts',
    ],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    rules: {
      // An unused parameter prefixed with _ is a deliberate signature match, not
      // an oversight — common in route handlers that ignore the request.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // `<img>` is used on purpose for arbitrary external addresses and for
      // library files served through an authenticated route; neither can go
      // through Next's optimiser, and each site carries a comment saying why.
      '@next/next/no-img-element': 'off',
    },
  },

  {
    // Scripts run under tsx outside the bundler and legitimately use the console.
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
