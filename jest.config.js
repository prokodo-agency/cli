/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Co-located tests alongside source files
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],

  // TypeScript transform via ts-jest
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },

  moduleFileExtensions: ['ts', 'js', 'json'],

  // Coverage
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/cli.ts', // CLI entrypoint — tested via integration
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],

  // Hard-gate: CI fails if any metric drops below 100%.
  // This turns coverage from a report into an enforced contract.
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },

  // Per-test timeout: 15s (generous for poll tests with real timers)
  testTimeout: 15_000,
};
