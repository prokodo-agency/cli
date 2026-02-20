import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['cjs'],
  target: 'node22',
  splitting: false,
  clean: true,
  minify: false,
  noExternal: [/.*/], // bundle all deps into the single dist/cli.js output
  sourcemap: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
