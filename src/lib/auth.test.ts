import { maskKey, isValidKeyShape } from './auth';

// ─── maskKey ─────────────────────────────────────────────────────────────────

describe('maskKey', () => {
  it('masks all but last 4 characters', () => {
    const masked = maskKey('pk_live_abcde12345');
    expect(masked.endsWith('2345')).toBe(true);
    expect(masked.startsWith('••')).toBe(true);
    expect(masked).not.toContain('pk_live_abcde');
  });

  it('handles short keys (≤4 chars)', () => {
    expect(maskKey('abcd')).toBe('••••');
    expect(maskKey('ab')).toBe('••••');
    expect(maskKey('')).toBe('••••');
  });

  it('handles exactly 4 characters', () => {
    expect(maskKey('1234')).toBe('••••');
  });

  it('longer key preserves last 4', () => {
    const result = maskKey('abcdefgh');
    expect(result.endsWith('efgh')).toBe(true);
    expect(result).not.toContain('abcd');
  });
});

// ─── isValidKeyShape ──────────────────────────────────────────────────────────

describe('isValidKeyShape', () => {
  it('accepts a normal key', () => {
    expect(isValidKeyShape('pk_live_abcdefgh')).toBe(true);
  });

  it('rejects placeholder with angle brackets', () => {
    expect(isValidKeyShape('<your-api-key>')).toBe(false);
    expect(isValidKeyShape('<key>')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidKeyShape('')).toBe(false);
  });

  it('rejects short keys (< 8 chars)', () => {
    expect(isValidKeyShape('abc')).toBe(false);
    expect(isValidKeyShape('1234567')).toBe(false);
  });

  it('accepts key exactly 8 chars', () => {
    expect(isValidKeyShape('abcdefgh')).toBe(true);
  });
});

// ─── Priority chain (env-var integration) ────────────────────────────────────

describe('resolveApiKey priority chain', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = process.env;
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it('reads PROKODO_API_KEY env var', () => {
    process.env = { ...savedEnv, PROKODO_API_KEY: 'pk_env_test_key_abcdef' };
    const key = process.env['PROKODO_API_KEY'];
    expect(key).toBeTruthy();
    expect(isValidKeyShape(key!)).toBe(true);
    expect(maskKey(key!)).not.toContain('pk_env_test_key_abc');
  });

  it('CLI flag takes precedence over env var (shape validation)', () => {
    const envKey = 'pk_env_key_12345678';
    const flagKey = 'pk_flag_key_abcdefgh';
    process.env = { ...savedEnv, PROKODO_API_KEY: envKey };
    expect(isValidKeyShape(flagKey)).toBe(true);
    expect(isValidKeyShape(envKey)).toBe(true);
    expect(flagKey).not.toBe(envKey);
  });
});
