import { maskKey, isValidKeyShape, resolveApiKey } from './auth';

jest.mock('./credentials', () => ({
  loadCredentials: jest.fn(() => null),
}));
jest.mock('./platform', () => ({
  isInteractive: jest.fn(() => false),
  getDefaultApiUrl: jest.fn(() => 'https://test.invalid'),
  getConfigDir: jest.fn(() => '/tmp/prokodo-test'),
}));

import { loadCredentials } from './credentials';
import { isInteractive } from './platform';

const mockLoadCredentials = loadCredentials as jest.MockedFunction<typeof loadCredentials>;
const mockIsInteractive = isInteractive as jest.MockedFunction<typeof isInteractive>;

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

  it('key longer than 4 chars has last-4 preserved and rest masked', () => {
    const key = 'pk_live_12345678';
    const masked = maskKey(key);
    expect(masked.endsWith('5678')).toBe(true);
    expect(masked).not.toContain('pk_live_');
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

  it('rejects angle bracket in key', () => {
    expect(isValidKeyShape('mykey>123abc')).toBe(false);
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

  it('accepts long key', () => {
    expect(isValidKeyShape('pk_live_abcdefghij1234567890')).toBe(true);
  });
});

// ─── resolveApiKey ────────────────────────────────────────────────────────────

describe('resolveApiKey', () => {
  let savedEnv: NodeJS.ProcessEnv;
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    savedEnv = { ...process.env };
    delete process.env['PROKODO_API_KEY'];
    jest.clearAllMocks();
    mockLoadCredentials.mockReturnValue(null);
    mockIsInteractive.mockReturnValue(false);
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit:${String(code)}`);
    });
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    exitSpy.mockRestore();
  });

  it('returns cliFlag when provided', () => {
    const key = resolveApiKey('pk_flag_12345678');
    expect(key).toBe('pk_flag_12345678');
  });

  it('trims whitespace from cliFlag', () => {
    const key = resolveApiKey('  pk_flag_12345678  ');
    expect(key).toBe('pk_flag_12345678');
  });

  it('ignores empty cliFlag and falls through to env var', () => {
    process.env['PROKODO_API_KEY'] = 'pk_env_12345678';
    expect(resolveApiKey('')).toBe('pk_env_12345678');
  });

  it('ignores whitespace-only cliFlag and falls through', () => {
    process.env['PROKODO_API_KEY'] = 'pk_env_12345678';
    expect(resolveApiKey('   ')).toBe('pk_env_12345678');
  });

  it('returns env var key when no flag', () => {
    process.env['PROKODO_API_KEY'] = 'pk_env_12345678';
    expect(resolveApiKey()).toBe('pk_env_12345678');
  });

  it('trims whitespace from env var', () => {
    process.env['PROKODO_API_KEY'] = '  pk_env_12345678  ';
    expect(resolveApiKey()).toBe('pk_env_12345678');
  });

  it('returns stored credentials key', () => {
    mockLoadCredentials.mockReturnValue({ apiKey: 'pk_stored_12345678' });
    expect(resolveApiKey()).toBe('pk_stored_12345678');
  });

  it('trims stored credential key', () => {
    mockLoadCredentials.mockReturnValue({ apiKey: '  pk_stored_12345678  ' });
    expect(resolveApiKey()).toBe('pk_stored_12345678');
  });

  it('ignores stored credentials with empty apiKey', () => {
    mockLoadCredentials.mockReturnValue({ apiKey: '' });
    expect(() => resolveApiKey()).toThrow('exit:2');
  });

  it('fatal non-interactive when no key found', () => {
    mockIsInteractive.mockReturnValue(false);
    expect(() => resolveApiKey()).toThrow('exit:2');
  });

  it('fatal interactive when no key found', () => {
    mockIsInteractive.mockReturnValue(true);
    expect(() => resolveApiKey()).toThrow('exit:2');
  });

  it('cliFlag has higher priority than env var', () => {
    process.env['PROKODO_API_KEY'] = 'pk_env_99999999';
    expect(resolveApiKey('pk_flag_12345678')).toBe('pk_flag_12345678');
  });

  it('env var has higher priority than credentials file', () => {
    process.env['PROKODO_API_KEY'] = 'pk_env_12345678';
    mockLoadCredentials.mockReturnValue({ apiKey: 'pk_stored_87654321' });
    expect(resolveApiKey()).toBe('pk_env_12345678');
  });
});
