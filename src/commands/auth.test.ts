import { Command } from 'commander';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSaveCredentials = jest.fn();
const mockDeleteCredentials: jest.Mock = jest.fn(() => true);
const mockLoadCredentials: jest.Mock = jest.fn(() => null);
const mockResolveApiKey: jest.Mock = jest.fn(() => 'pk_test_12345678');
const mockIsValidKeyShape: jest.Mock = jest.fn(() => true);
const mockMaskKey: jest.Mock = jest.fn((k: string) => `••••${k.slice(-4)}`);
const mockGetDefaultApiUrl: jest.Mock = jest.fn(() => 'https://test.invalid');
const mockIsInteractive: jest.Mock = jest.fn(() => false);
const mockSuccess = jest.fn();
const mockInfo = jest.fn();
const mockFatal: jest.Mock = jest.fn((msg: string, code: number = 1) => {
  throw new Error(`fatal:${String(code)}:${msg}`);
});
const mockEmitJson = jest.fn();
const mockApiGet: jest.Mock = jest.fn(async () => ({ status: 'ok', apiVersion: '1.0' }));
const MockApiClient = jest.fn(() => ({ get: mockApiGet }));

jest.mock('../lib/credentials', () => ({
  saveCredentials: (...args: unknown[]) => mockSaveCredentials(...args),
  deleteCredentials: () => mockDeleteCredentials(),
  loadCredentials: () => mockLoadCredentials(),
  credentialsPath: () => '/tmp/prokodo-test/credentials.json',
}));
jest.mock('../lib/auth', () => ({
  resolveApiKey: (k?: string) => mockResolveApiKey(k),
  isValidKeyShape: (k: string) => mockIsValidKeyShape(k),
  maskKey: (k: string) => mockMaskKey(k),
}));
jest.mock('../lib/platform', () => ({
  getDefaultApiUrl: () => mockGetDefaultApiUrl(),
  isInteractive: () => mockIsInteractive(),
}));
jest.mock('../lib/logger', () => ({
  success: (...args: unknown[]) => mockSuccess(...args),
  info: (...args: unknown[]) => mockInfo(...args),
  fatal: (...args: unknown[]) => mockFatal(...args),
  emitJson: (...args: unknown[]) => mockEmitJson(...args),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../lib/apiClient', () => ({
  ApiClient: MockApiClient,
  ApiRequestError: class ApiRequestError extends Error {
    constructor(
      message: string,
      public code: string,
      public statusCode: number,
    ) {
      super(message);
    }
  },
}));

import { registerAuthCommands } from './auth';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output', false);
  program.option('--api-url <url>', 'API URL');
  program.option('--api-key <key>', 'API key');
  return program;
}

interface RunAuthOptions {
  json?: boolean;
  apiUrl?: string;
  apiKey?: string; // --api-key global flag
}

async function runAuthCmd(
  subArgs: string[],
  opts: RunAuthOptions = {},
): Promise<{ exitCode?: number }> {
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`exit:${String(code)}`);
  });

  let exitCode: number | undefined;

  try {
    const program = makeProgram();
    if (opts.json) program.setOptionValue('json', true);
    if (opts.apiUrl) program.setOptionValue('apiUrl', opts.apiUrl);
    if (opts.apiKey) program.setOptionValue('apiKey', opts.apiKey);
    registerAuthCommands(program);
    await program.parseAsync(['node', 'prokodo', ...subArgs]);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('exit:')) {
      exitCode = Number(err.message.slice(5));
    } else if (err instanceof Error && err.message.startsWith('fatal:')) {
      exitCode = Number(err.message.split(':')[1] ?? 1);
    } else {
      throw err;
    }
  } finally {
    exitSpy.mockRestore();
  }

  return { exitCode };
}

// ─── auth login ───────────────────────────────────────────────────────────────

describe('auth login — with --key', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsValidKeyShape.mockReturnValue(true);
    mockApiGet.mockResolvedValue({ status: 'ok', apiVersion: '1.0' });
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
  });

  it('saves credentials when key is valid and API accepts it', async () => {
    await runAuthCmd(['auth', 'login', '--key', 'pk_valid_12345678']);
    expect(mockSaveCredentials).toHaveBeenCalledWith({ apiKey: 'pk_valid_12345678' });
  });

  it('calls success in text mode on successful login', async () => {
    await runAuthCmd(['auth', 'login', '--key', 'pk_valid_12345678']);
    expect(mockSuccess).toHaveBeenCalledTimes(1);
  });

  it('emits JSON when --json is set', async () => {
    await runAuthCmd(['auth', 'login', '--key', 'pk_valid_12345678'], { json: true });
    expect(mockEmitJson).toHaveBeenCalledWith(expect.objectContaining({ authenticated: true }));
  });

  it('calls fatal when key shape is invalid', async () => {
    mockIsValidKeyShape.mockReturnValue(false);
    await runAuthCmd(['auth', 'login', '--key', '<bad-key>']);
    expect(mockFatal).toHaveBeenCalledTimes(1);
  });

  it('calls fatal when API rejects the key', async () => {
    mockApiGet.mockRejectedValue(new Error('Unauthorized'));
    await runAuthCmd(['auth', 'login', '--key', 'pk_valid_12345678']);
    expect(mockFatal).toHaveBeenCalledTimes(1);
  });

  it('uses PROKODO_API_KEY env var when no --key provided', async () => {
    const savedKey = process.env['PROKODO_API_KEY'];
    process.env['PROKODO_API_KEY'] = 'pk_env_12345678';
    try {
      await runAuthCmd(['auth', 'login']);
      expect(mockSaveCredentials).toHaveBeenCalledWith({ apiKey: 'pk_env_12345678' });
    } finally {
      if (savedKey !== undefined) process.env['PROKODO_API_KEY'] = savedKey;
      else delete process.env['PROKODO_API_KEY'];
    }
  });

  it('calls fatal when no key and not interactive', async () => {
    const savedKey = process.env['PROKODO_API_KEY'];
    delete process.env['PROKODO_API_KEY'];
    mockIsInteractive.mockReturnValue(false);
    try {
      await runAuthCmd(['auth', 'login']);
      expect(mockFatal).toHaveBeenCalledTimes(1);
    } finally {
      if (savedKey !== undefined) process.env['PROKODO_API_KEY'] = savedKey;
    }
  });
});

// ─── auth logout ─────────────────────────────────────────────────────────────

describe('auth logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls success when credentials file existed', async () => {
    mockDeleteCredentials.mockReturnValue(true);
    await runAuthCmd(['auth', 'logout']);
    expect(mockSuccess).toHaveBeenCalledTimes(1);
  });

  it('calls info when no credentials were stored', async () => {
    mockDeleteCredentials.mockReturnValue(false);
    await runAuthCmd(['auth', 'logout']);
    expect(mockInfo).toHaveBeenCalled();
  });

  it('emits JSON with loggedOut=true when file existed', async () => {
    mockDeleteCredentials.mockReturnValue(true);
    await runAuthCmd(['auth', 'logout'], { json: true });
    expect(mockEmitJson).toHaveBeenCalledWith({ loggedOut: true });
  });

  it('emits JSON with loggedOut=false when no file', async () => {
    mockDeleteCredentials.mockReturnValue(false);
    await runAuthCmd(['auth', 'logout'], { json: true });
    expect(mockEmitJson).toHaveBeenCalledWith({ loggedOut: false });
  });
});

// ─── auth whoami ─────────────────────────────────────────────────────────────

describe('auth whoami', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveApiKey.mockReturnValue('pk_test_12345678');
    mockMaskKey.mockImplementation((k: string) => `••••${k.slice(-4)}`);
    mockLoadCredentials.mockReturnValue(null);
  });

  it('calls info with masked key in text mode', async () => {
    await runAuthCmd(['auth', 'whoami']);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('API key'));
  });

  it('emits JSON with keyHint in JSON mode', async () => {
    await runAuthCmd(['auth', 'whoami'], { json: true });
    expect(mockEmitJson).toHaveBeenCalledWith(
      expect.objectContaining({ keyHint: expect.any(String) }),
    );
  });

  it('shows credentials file as source when file has credentials', async () => {
    mockLoadCredentials.mockReturnValue({ apiKey: 'pk_stored_12345678' });
    await runAuthCmd(['auth', 'whoami']);
    const allCalls = mockInfo.mock.calls.flat().join(' ');
    expect(allCalls).toContain('credentials file');
  });

  it('shows env var as source when env var is set', async () => {
    const savedKey = process.env['PROKODO_API_KEY'];
    process.env['PROKODO_API_KEY'] = 'pk_env_12345678';
    try {
      await runAuthCmd(['auth', 'whoami']);
      const allCalls = mockInfo.mock.calls.flat().join(' ');
      expect(allCalls).toContain('PROKODO_API_KEY');
    } finally {
      if (savedKey !== undefined) process.env['PROKODO_API_KEY'] = savedKey;
      else delete process.env['PROKODO_API_KEY'];
    }
  });

  it('shows --api-key flag as source when no creds or env', async () => {
    const savedKey = process.env['PROKODO_API_KEY'];
    delete process.env['PROKODO_API_KEY'];
    mockLoadCredentials.mockReturnValue(null);
    try {
      await runAuthCmd(['auth', 'whoami'], { apiKey: 'pk_flag_12345678' });
      const allCalls = mockInfo.mock.calls.flat().join(' ');
      expect(allCalls).toContain('--api-key flag');
    } finally {
      if (savedKey !== undefined) process.env['PROKODO_API_KEY'] = savedKey;
    }
  });
});
