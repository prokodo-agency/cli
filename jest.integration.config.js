/** @type {import('jest').Config} */
module.exports = {
  displayName: 'integration',
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Only pick up files under tests/integration/
  testMatch: ['<rootDir>/tests/**/*.integration.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],

  // TypeScript via ts-jest (same tsconfig as unit tests)
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },

  moduleFileExtensions: ['ts', 'js', 'json'],

  // Longer timeout: each test spawns a subprocess, and doctor does a real
  // (fast-fail) network call against a dead loopback address.
  testTimeout: 30_000,

  // No coverage collection — integration tests exercise the binary, not src/
};
