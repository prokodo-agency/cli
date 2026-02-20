import os from 'node:os';
import path from 'node:path';
import { getConfigDir, isCI, getDefaultApiUrl, isInteractive } from './platform';

// ─── getConfigDir ─────────────────────────────────────────────────────────────

describe('getConfigDir', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalDescriptor);
  });

  it('returns ~/.config/prokodo on linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    expect(getConfigDir()).toBe(path.join(os.homedir(), '.config', 'prokodo'));
  });

  it('returns ~/.config/prokodo on darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    expect(getConfigDir()).toBe(path.join(os.homedir(), '.config', 'prokodo'));
  });

  it('uses %APPDATA% on win32', () => {
    const originalEnv = process.env;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env = { ...originalEnv, APPDATA: 'C:\\Users\\TestUser\\AppData\\Roaming' };

    const result = getConfigDir();
    expect(result).toContain('prokodo');
    expect(result.startsWith('C:\\Users\\TestUser\\AppData\\Roaming')).toBe(true);

    process.env = originalEnv;
  });

  it('falls back to homedir AppData when %APPDATA% missing on win32', () => {
    const originalEnv = process.env;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const envWithoutAppdata = { ...originalEnv };
    delete envWithoutAppdata['APPDATA'];
    process.env = envWithoutAppdata;

    const result = getConfigDir();
    expect(result).toContain('prokodo');
    // Fallback includes homedir
    expect(result.includes('AppData') || result.includes(os.homedir())).toBe(true);

    process.env = originalEnv;
  });
});

// ─── isCI ─────────────────────────────────────────────────────────────────────

describe('isCI', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = process.env;
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it('returns true when CI env var is set', () => {
    process.env = { ...savedEnv, CI: 'true' };
    expect(isCI()).toBe(true);
  });

  it('returns true when GITHUB_ACTIONS is set', () => {
    const env = { ...savedEnv };
    delete env['CI'];
    process.env = { ...env, GITHUB_ACTIONS: 'true' };
    expect(isCI()).toBe(true);
  });

  it('returns true when GITLAB_CI is set', () => {
    const env = { ...savedEnv };
    delete env['CI'];
    process.env = { ...env, GITLAB_CI: 'true' };
    expect(isCI()).toBe(true);
  });

  it('returns false when no CI env vars present', () => {
    const env = { ...savedEnv };
    delete env['CI'];
    delete env['GITHUB_ACTIONS'];
    delete env['GITLAB_CI'];
    delete env['CIRCLECI'];
    delete env['TRAVIS'];
    process.env = env;
    expect(isCI()).toBe(false);
  });
});

// ─── getDefaultApiUrl ─────────────────────────────────────────────────────────

describe('getDefaultApiUrl', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = process.env;
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it('returns production URL by default', () => {
    const env = { ...savedEnv };
    delete env['PROKODO_API_BASE_URL'];
    process.env = env;
    expect(getDefaultApiUrl()).toBe('https://marketplace.prokodo.com');
  });

  it('reads PROKODO_API_BASE_URL env var', () => {
    process.env = { ...savedEnv, PROKODO_API_BASE_URL: 'https://staging.prokodo.com' };
    expect(getDefaultApiUrl()).toBe('https://staging.prokodo.com');
  });

  it('strips trailing slash from env var', () => {
    process.env = { ...savedEnv, PROKODO_API_BASE_URL: 'https://staging.prokodo.com/' };
    expect(getDefaultApiUrl()).toBe('https://staging.prokodo.com');
  });
});

// ─── isInteractive ────────────────────────────────────────────────────────────

describe('isInteractive', () => {
  it('returns a boolean', () => {
    expect(typeof isInteractive()).toBe('boolean');
  });
});
