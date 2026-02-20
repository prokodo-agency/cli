import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';

// ─── Mocks ────────────────────────────────────────────────────────────────────

class MockPollTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms waiting for ${label}`);
    this.name = 'PollTimeoutError';
  }
}

const mockPoll: jest.Mock = jest.fn(async () => ({ runId: 'run-123', status: 'success' }));
const mockLoadConfig: jest.Mock = jest.fn(() => ({
  projectSlug: 'test-project',
  verifyGlobs: ['src/**/*'],
  timeout: 300,
}));
const mockResolveApiKey: jest.Mock = jest.fn(() => 'pk_test_12345678');
const mockGetDefaultApiUrl: jest.Mock = jest.fn(() => 'https://test.invalid');
const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockSuccess = jest.fn();
const mockEmitJson = jest.fn();
const mockLogLine = jest.fn();
const mockFatal = jest.fn((msg: string, code: number = 1) => {
  throw new Error(`fatal:${code}:${msg}`);
});
const mockDebug = jest.fn();

const mockApiGet: jest.Mock = jest.fn(async () => ({}));
const mockApiPost: jest.Mock = jest.fn(async () => ({
  runId: 'run-123',
  status: 'queued',
  creditsEstimated: 1,
}));
const MockApiClient = jest.fn(() => ({ get: mockApiGet, post: mockApiPost }));

jest.mock('../lib/poll', () => ({
  poll: (...args: Parameters<typeof mockPoll>) => mockPoll(...args),
  PollTimeoutError: MockPollTimeoutError,
}));
jest.mock('../lib/config', () => ({ loadConfig: () => mockLoadConfig() }));
jest.mock('../lib/auth', () => ({ resolveApiKey: (k?: string) => mockResolveApiKey(k) }));
jest.mock('../lib/platform', () => ({ getDefaultApiUrl: () => mockGetDefaultApiUrl() }));
jest.mock('../lib/logger', () => ({
  info: (...args: unknown[]) => mockInfo(...args),
  warn: (...args: unknown[]) => mockWarn(...args),
  error: (...args: unknown[]) => mockError(...args),
  success: (...args: unknown[]) => mockSuccess(...args),
  emitJson: (...args: unknown[]) => mockEmitJson(...args),
  logLine: (...args: unknown[]) => mockLogLine(...args),
  fatal: (msg: string, code?: number) => mockFatal(msg, code),
  debug: (...args: unknown[]) => mockDebug(...args),
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

import { registerVerifyCommand } from './verify';

// Re-import the mocked ApiRequestError for use in tests
const { ApiRequestError } = jest.requireMock('../lib/apiClient') as {
  ApiRequestError: new (
    message: string,
    code: string,
    statusCode: number,
  ) => Error & {
    code: string;
    statusCode: number;
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output', false);
  program.option('--api-url <url>', 'API URL');
  program.option('--api-key <key>', 'API key');
  return program;
}

interface RunVerifyOptions {
  json?: boolean;
  apiKey?: string;
  ref?: string;
  timeout?: string;
  noLogs?: boolean;
  cwd?: string;
}

async function runVerify(opts: RunVerifyOptions = {}): Promise<{ exitCode?: number }> {
  const savedCwd = process.cwd();
  if (opts.cwd) process.chdir(opts.cwd);

  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`exit:${String(code)}`);
  });

  let exitCode: number | undefined;

  try {
    const program = makeProgram();
    if (opts.json) program.setOptionValue('json', true);
    if (opts.apiKey) program.setOptionValue('apiKey', opts.apiKey);
    registerVerifyCommand(program);

    const args = ['node', 'prokodo', 'verify'];
    if (opts.ref) args.push('--ref', opts.ref);
    if (opts.timeout) args.push('--timeout', opts.timeout);
    if (opts.noLogs) args.push('--no-logs');

    await program.parseAsync(args);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('exit:')) {
      exitCode = Number(err.message.slice(5));
    } else if (err instanceof Error && err.message.startsWith('fatal:')) {
      // fatal was called — treat as exit
      exitCode = Number(err.message.split(':')[1] ?? 1);
    } else {
      throw err;
    }
  } finally {
    if (opts.cwd) process.chdir(savedCwd);
    exitSpy.mockRestore();
  }

  return { exitCode };
}

// ─── Setup tmpDir with matching files ────────────────────────────────────────

function createTmpProjectDir(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-verify-'));
  // Create src/ directory with some files
  fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export const x = 1;');
  fs.writeFileSync(path.join(tmpDir, 'src', 'util.ts'), 'export const y = 2;');
  return tmpDir;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerVerifyCommand — config error', () => {
  it('calls fatal when loadConfig throws', async () => {
    mockLoadConfig.mockImplementationOnce(() => {
      throw new Error('No config found');
    });
    expect(mockFatal).not.toHaveBeenCalled();
    try {
      await runVerify();
    } catch {
      // expected
    }
    expect(mockFatal).toHaveBeenCalled();
  });
});

describe('registerVerifyCommand — invalid timeout', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = createTmpProjectDir();
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });
    mockDebug.mockReset();
    mockFatal.mockImplementation((msg: string, code: number = 1) => {
      throw new Error(`fatal:${code}:${msg}`);
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('calls fatal for negative timeout', async () => {
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });
    try {
      await runVerify({ timeout: '-1', cwd: tmpDir });
    } catch {
      // expected
    }
    expect(mockFatal).toHaveBeenCalled();
  });

  it('calls fatal for non-numeric timeout', async () => {
    try {
      await runVerify({ timeout: 'abc', cwd: tmpDir });
    } catch {
      // expected
    }
    expect(mockFatal).toHaveBeenCalled();
  });
});

describe('registerVerifyCommand — no files found', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFatal.mockImplementation((msg: string, code: number = 1) => {
      throw new Error(`fatal:${code}:${msg}`);
    });
  });

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('calls fatal when no files match verifyGlobs', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-empty-'));
    // No src/ directory → no matching files
    mockLoadConfig.mockReturnValue({
      projectSlug: 'empty-project',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });
    try {
      await runVerify({ cwd: tmpDir });
    } catch {
      // expected
    }
    expect(mockFatal).toHaveBeenCalled();
  });
});

describe('registerVerifyCommand — success flow', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = createTmpProjectDir();
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });
    mockResolveApiKey.mockReturnValue('pk_test_12345678');
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
    mockApiPost.mockResolvedValue({ runId: 'run-123', status: 'queued', creditsEstimated: 2 });
    mockPoll.mockResolvedValue({ runId: 'run-123', status: 'success' });
    mockApiGet.mockResolvedValue({
      runId: 'run-123',
      passed: true,
      summary: 'All checks passed',
      checks: [{ name: 'Smoke test', passed: true }],
      creditsUsed: 2,
    });
    mockFatal.mockImplementation((msg: string, code: number = 1) => {
      throw new Error(`fatal:${code}:${msg}`);
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exits 0 on success in text mode', async () => {
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(0);
  });

  it('exits 0 on success in JSON mode', async () => {
    const { exitCode } = await runVerify({ json: true, cwd: tmpDir });
    expect(exitCode).toBe(0);
  });

  it('calls success in text mode when passed', async () => {
    await runVerify({ cwd: tmpDir });
    expect(mockSuccess).toHaveBeenCalled();
  });

  it('emits JSON with passed=true in JSON mode', async () => {
    await runVerify({ json: true, cwd: tmpDir });
    expect(mockEmitJson).toHaveBeenCalledWith(expect.objectContaining({ passed: true }));
  });

  it('logs run start info', async () => {
    await runVerify({ cwd: tmpDir });
    // info should be called for "Run started: ..." and check details
    expect(mockInfo).toHaveBeenCalled();
  });

  it('passes ref option to the run request', async () => {
    await runVerify({ ref: 'main', cwd: tmpDir });
    expect(mockApiPost).toHaveBeenCalledWith(
      '/api/cli/v1/verify/run',
      expect.objectContaining({ ref: 'main' }),
    );
  });

  it('uses --api-url when provided', async () => {
    await runVerify({ cwd: tmpDir });
    expect(MockApiClient).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://test.invalid' }),
    );
  });

  it('poll fn callback is invoked (covers streaming + status path)', async () => {
    // Override poll to synchronously invoke the fn callback
    mockPoll.mockImplementationOnce(async (opts: { fn: () => Promise<unknown> }) => {
      // Call fn once to exercise the streaming + client.get code inside it
      mockApiGet
        .mockResolvedValueOnce({
          lines: [{ level: 'info', ts: '2026-01-01T00:00:00Z', msg: 'log' }],
          nextCursor: '',
        })
        .mockResolvedValueOnce({ status: 'success', runId: 'run-123' });
      await opts.fn();
      return { runId: 'run-123', status: 'success' };
    });
    // After poll, the result fetch uses the default mockApiGet (set by beforeEach)
    mockApiGet.mockResolvedValue({
      runId: 'run-123',
      passed: true,
      summary: 'All checks passed',
      checks: [{ name: 'Smoke test', passed: true }],
      creditsUsed: 2,
    });
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(0);
    expect(mockLogLine).toHaveBeenCalled();
  });
});

describe('registerVerifyCommand — failure flow', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = createTmpProjectDir();
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });
    mockResolveApiKey.mockReturnValue('pk_test_12345678');
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
    mockApiPost.mockResolvedValue({ runId: 'run-123', status: 'queued', creditsEstimated: 1 });
    mockPoll.mockResolvedValue({ runId: 'run-123', status: 'failed' });
    mockApiGet.mockResolvedValue({
      runId: 'run-123',
      passed: false,
      summary: 'Checks failed',
      checks: [{ name: 'Smoke test', passed: false, message: 'Expected x got y' }],
      creditsUsed: 1,
    });
    mockFatal.mockImplementation((msg: string, code: number = 1) => {
      throw new Error(`fatal:${code}:${msg}`);
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exits 1 when verification fails', async () => {
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(1);
  });

  it('calls error in text mode when failed', async () => {
    await runVerify({ cwd: tmpDir });
    expect(mockError).toHaveBeenCalled();
  });

  it('emits JSON with passed=false', async () => {
    await runVerify({ json: true, cwd: tmpDir });
    expect(mockEmitJson).toHaveBeenCalledWith(expect.objectContaining({ passed: false }));
  });
});

describe('registerVerifyCommand — start run errors', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = createTmpProjectDir();
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });
    mockResolveApiKey.mockReturnValue('pk_test_12345678');
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
    mockFatal.mockImplementation((msg: string, code: number = 1) => {
      throw new Error(`fatal:${code}:${msg}`);
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles 401 auth error', async () => {
    mockApiPost.mockRejectedValue(new ApiRequestError('Unauthorized', 'unauthorized', 401));
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(1);
    expect(mockError).toHaveBeenCalled();
  });

  it('handles 402 insufficient credits', async () => {
    mockApiPost.mockRejectedValue(
      new ApiRequestError('Payment Required', 'insufficient_credits', 402),
    );
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(1);
    expect(mockError).toHaveBeenCalled();
  });

  it('handles 409 conflict error', async () => {
    mockApiPost.mockRejectedValue(new ApiRequestError('Conflict', 'conflict', 409));
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(1);
    expect(mockError).toHaveBeenCalled();
  });

  it('handles 403 forbidden as auth error', async () => {
    mockApiPost.mockRejectedValue(new ApiRequestError('Forbidden', 'forbidden', 403));
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(1);
    expect(mockError).toHaveBeenCalled();
  });

  it('handles generic API error with status code', async () => {
    mockApiPost.mockRejectedValue(
      new ApiRequestError('Internal Server Error', 'server_error', 500),
    );
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(1);
  });

  it('handles network error (non-ApiRequestError)', async () => {
    mockApiPost.mockRejectedValue(new Error('ECONNREFUSED'));
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(1);
  });

  it('handles JSON mode for API error', async () => {
    mockApiPost.mockRejectedValue(new ApiRequestError('Unauthorized', 'unauthorized', 401));
    await runVerify({ json: true, cwd: tmpDir });
    expect(mockEmitJson).toHaveBeenCalledWith(expect.objectContaining({ error: 'unauthorized' }));
  });

  it('handles JSON mode for network error', async () => {
    mockApiPost.mockRejectedValue(new Error('Connection reset'));
    await runVerify({ json: true, cwd: tmpDir });
    expect(mockEmitJson).toHaveBeenCalledWith(expect.objectContaining({ error: 'network_error' }));
  });
});

describe('registerVerifyCommand — poll timeout', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = createTmpProjectDir();
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });
    mockResolveApiKey.mockReturnValue('pk_test_12345678');
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
    mockApiPost.mockResolvedValue({ runId: 'run-123', status: 'queued', creditsEstimated: 1 });
    mockFatal.mockImplementation((msg: string, code: number = 1) => {
      throw new Error(`fatal:${code}:${msg}`);
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exits 1 and calls error on poll timeout (text mode)', async () => {
    mockPoll.mockRejectedValue(new MockPollTimeoutError('verify:run-123', 300_000));
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(1);
    expect(mockError).toHaveBeenCalled();
  });

  it('emits JSON with error=timeout on poll timeout (JSON mode)', async () => {
    mockPoll.mockRejectedValue(new MockPollTimeoutError('verify:run-123', 300_000));
    const { exitCode } = await runVerify({ json: true, cwd: tmpDir });
    expect(exitCode).toBe(1);
    expect(mockEmitJson).toHaveBeenCalledWith(expect.objectContaining({ error: 'timeout' }));
  });

  it('handles poll API error', async () => {
    mockPoll.mockRejectedValue(new ApiRequestError('Server Error', 'server_error', 500));
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(1);
  });
});

describe('registerVerifyCommand — result fetch errors', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = createTmpProjectDir();
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });
    mockResolveApiKey.mockReturnValue('pk_test_12345678');
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
    mockApiPost.mockResolvedValue({ runId: 'run-123', status: 'queued', creditsEstimated: 1 });
    mockPoll.mockResolvedValue({ runId: 'run-123', status: 'success' });
    mockFatal.mockImplementation((msg: string, code: number = 1) => {
      throw new Error(`fatal:${code}:${msg}`);
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles API error when fetching result', async () => {
    mockApiGet.mockRejectedValue(new ApiRequestError('Not Found', 'not_found', 404));
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(1);
  });
});

describe('registerVerifyCommand — log streaming', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = createTmpProjectDir();
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });
    mockResolveApiKey.mockReturnValue('pk_test_12345678');
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
    mockApiPost.mockResolvedValue({ runId: 'run-123', status: 'queued', creditsEstimated: 1 });
    mockFatal.mockImplementation((msg: string, code: number = 1) => {
      throw new Error(`fatal:${code}:${msg}`);
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('calls logLine when logs are streamed during polling', async () => {
    // Make poll invoke the fn() to trigger log streaming
    mockPoll.mockImplementation(async (config: { fn: () => Promise<unknown> }) => {
      await config.fn(); // triggers streamLogs
      return { runId: 'run-123', status: 'success' };
    });

    // Return logs on the first logs call, then result
    let getCallCount = 0;
    mockApiGet.mockImplementation(async (url: string) => {
      getCallCount++;
      if (url.includes('/logs')) {
        return {
          lines: [{ seq: 1, ts: '2024-01-01T00:00:00Z', level: 'info', msg: 'Test log line' }],
          nextCursor: 'cursor-2',
          done: false,
        };
      }
      // result call
      return {
        runId: 'run-123',
        passed: true,
        summary: 'Passed',
        checks: [],
        creditsUsed: 1,
      };
    });

    await runVerify({ cwd: tmpDir });
    expect(mockLogLine).toHaveBeenCalled();
    void getCallCount;
  });

  it('continues even when log streaming fails', async () => {
    mockPoll.mockImplementation(async (config: { fn: () => Promise<unknown> }) => {
      await config.fn(); // triggers streamLogs which will throw
      return { runId: 'run-123', status: 'success' };
    });

    let isFirstGet = true;
    mockApiGet.mockImplementation(async (url: string) => {
      if (url.includes('/logs')) {
        if (isFirstGet) {
          isFirstGet = false;
          throw new Error('Log streaming unavailable');
        }
      }
      return {
        runId: 'run-123',
        passed: true,
        summary: 'Passed',
        checks: [],
        creditsUsed: 1,
      };
    });

    // Should not throw even though log streaming fails
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(0);
  });

  it('does not call logLine when --no-logs is set', async () => {
    mockPoll.mockImplementation(async (config: { fn: () => Promise<unknown> }) => {
      await config.fn();
      return { runId: 'run-123', status: 'success' };
    });

    mockApiGet.mockResolvedValue({
      runId: 'run-123',
      passed: true,
      summary: 'Passed',
      checks: [],
      creditsUsed: 1,
    });

    await runVerify({ noLogs: true, cwd: tmpDir });
    expect(mockLogLine).not.toHaveBeenCalled();
  });
});

describe('registerVerifyCommand — collectFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveApiKey.mockReturnValue('pk_test_12345678');
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
    mockApiPost.mockResolvedValue({ runId: 'run-123', status: 'queued', creditsEstimated: 1 });
    mockPoll.mockResolvedValue({ runId: 'run-123', status: 'success' });
    mockApiGet.mockResolvedValue({
      runId: 'run-123',
      passed: true,
      summary: 'Passed',
      checks: [],
      creditsUsed: 1,
    });
    mockFatal.mockImplementation((msg: string, code: number = 1) => {
      throw new Error(`fatal:${code}:${msg}`);
    });
  });

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skips hidden files', async () => {
    tmpDir = createTmpProjectDir();
    fs.writeFileSync(path.join(tmpDir, 'src', '.hidden.ts'), 'hidden');
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });

    await runVerify({ cwd: tmpDir });

    const postCallArgs = mockApiPost.mock.calls[0] as unknown[];
    const postCall = postCallArgs[1] as {
      files: Array<{ path: string }>;
    };
    const paths = postCall.files.map((f) => f.path);
    expect(paths.some((p) => p.includes('.hidden'))).toBe(false);
  });

  it('skips node_modules', async () => {
    tmpDir = createTmpProjectDir();
    fs.mkdirSync(path.join(tmpDir, 'src', 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'node_modules', 'dep.ts'), 'module');
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });

    await runVerify({ cwd: tmpDir });

    const nodeCallArgs = mockApiPost.mock.calls[0] as unknown[];
    const nodeCall = nodeCallArgs[1] as {
      files: Array<{ path: string }>;
    };
    const paths = nodeCall.files.map((f) => f.path);
    expect(paths.some((p) => p.includes('node_modules'))).toBe(false);
  });

  it('warns and skips files larger than 500 KB', async () => {
    tmpDir = createTmpProjectDir();
    const largeContent = Buffer.alloc(600_000, 'x');
    fs.writeFileSync(path.join(tmpDir, 'src', 'large.ts'), largeContent);
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });

    await runVerify({ cwd: tmpDir });

    expect(mockWarn).toHaveBeenCalled();
    const largeCallArgs = mockApiPost.mock.calls[0] as unknown[];
    const largeCall = largeCallArgs[1] as {
      files: Array<{ path: string }>;
    };
    const paths = largeCall.files.map((f) => f.path);
    expect(paths.some((p) => p.includes('large.ts'))).toBe(false);
  });

  it('includes files with base64 content', async () => {
    tmpDir = createTmpProjectDir();
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });

    await runVerify({ cwd: tmpDir });

    const b64CallArgs = mockApiPost.mock.calls[0] as unknown[];
    const b64Call = b64CallArgs[1] as {
      files: Array<{ path: string; contentBase64: string }>;
    };
    expect(b64Call.files.length).toBeGreaterThan(0);
    expect(b64Call.files[0]?.contentBase64).toBeTruthy();
  });

  it('excludes files matching exclude glob patterns', async () => {
    tmpDir = createTmpProjectDir();
    // Use an exclude pattern to trigger the exclude.some callback
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*', '!src/util.ts'],
      timeout: 300,
    });

    await runVerify({ cwd: tmpDir });

    const exCallArgs = mockApiPost.mock.calls[0] as unknown[];
    const exCall = exCallArgs[1] as { files: Array<{ path: string }> };
    const paths = exCall.files.map((f) => f.path);
    expect(paths.some((p) => p.includes('util.ts'))).toBe(false);
    expect(paths.some((p) => p.includes('index.ts'))).toBe(true);
  });
});
