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
const mockResolveRunContext: jest.Mock = jest.fn(() => ({
  projectType: 'n8n-node',
  packageName: 'test-package',
  source: undefined,
  include: ['src'],
  timeoutMs: 300_000,
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
jest.mock('../lib/resolveRunContext', () => ({
  resolveRunContext: (...args: unknown[]) => mockResolveRunContext(...args),
}));
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
  file?: string;
  type?: string;
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
    if (opts.file) args.push(opts.file);
    if (opts.type) args.push('--type', opts.type);
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

describe('registerVerifyCommand — resolveRunContext error', () => {
  it('calls fatal when --type flag is invalid', async () => {
    expect(mockFatal).not.toHaveBeenCalled();
    try {
      const program = makeProgram();
      registerVerifyCommand(program);
      await program.parseAsync(['node', 'prokodo', 'verify', '--type', 'invalid-type']);
    } catch {
      // expected
    }
    expect(mockFatal).toHaveBeenCalledTimes(1);
  });
});

describe('registerVerifyCommand — invalid timeout', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = createTmpProjectDir();
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      packageName: 'test',
      source: undefined,
      include: ['src'],
      timeoutMs: 300_000,
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
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      packageName: 'test',
      source: undefined,
      include: ['src'],
      timeoutMs: 300_000,
    });
    try {
      await runVerify({ timeout: '-1', cwd: tmpDir });
    } catch {
      // expected
    }
    expect(mockFatal).toHaveBeenCalledTimes(1);
  });

  it('calls fatal for non-numeric timeout', async () => {
    try {
      await runVerify({ timeout: 'abc', cwd: tmpDir });
    } catch {
      // expected
    }
    expect(mockFatal).toHaveBeenCalledTimes(1);
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

  it('calls fatal when no files match include list', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-empty-'));
    // No src/ directory → no matching files
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      include: [],
      timeoutMs: 300_000,
    });
    try {
      await runVerify({ cwd: tmpDir });
    } catch {
      // expected
    }
    expect(mockFatal).toHaveBeenCalledTimes(1);
  });
});

describe('registerVerifyCommand — success flow', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = createTmpProjectDir();
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      packageName: 'test',
      source: undefined,
      include: ['src'],
      timeoutMs: 300_000,
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
    expect(mockSuccess).toHaveBeenCalledTimes(1);
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
      '/api/cli/v1/verify/runs',
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
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      packageName: 'test',
      source: undefined,
      include: ['src'],
      timeoutMs: 300_000,
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
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      packageName: 'test',
      source: undefined,
      include: ['src'],
      timeoutMs: 300_000,
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
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      packageName: 'test',
      source: undefined,
      include: ['src'],
      timeoutMs: 300_000,
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
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      packageName: 'test',
      source: undefined,
      include: ['src'],
      timeoutMs: 300_000,
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
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      packageName: 'test',
      source: undefined,
      include: ['src'],
      timeoutMs: 300_000,
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

    // First mock call → /logs endpoint; remaining calls → result endpoint.
    mockApiGet.mockImplementation(async (url: string) => {
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
    // The logs endpoint must have been hit at least once.
    expect(mockApiGet).toHaveBeenCalledWith(expect.stringContaining('/logs'));
  });

  it('continues even when log streaming fails', async () => {
    mockPoll.mockImplementation(async (config: { fn: () => Promise<unknown> }) => {
      await config.fn(); // triggers streamLogs which will throw
      return { runId: 'run-123', status: 'success' };
    });

    // The first call to the logs endpoint throws; subsequent calls return the result.
    let logCallCount = 0;
    mockApiGet.mockImplementation(async (url: string) => {
      if (url.includes('/logs')) {
        logCallCount++;
        if (logCallCount === 1) throw new Error('Log streaming unavailable');
      }
      return {
        runId: 'run-123',
        passed: true,
        summary: 'Passed',
        checks: [],
        creditsUsed: 1,
      };
    });

    // Should complete successfully even though log streaming threw on the first call.
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(0);
    expect(logCallCount).toBeGreaterThanOrEqual(1);
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
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      packageName: 'test',
      source: undefined,
      include: ['src'],
      timeoutMs: 300_000,
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
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      packageName: 'test',
      source: undefined,
      include: ['src'],
      timeoutMs: 300_000,
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
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      packageName: 'test',
      source: undefined,
      include: ['src'],
      timeoutMs: 300_000,
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
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      packageName: 'test',
      source: undefined,
      include: ['src'],
      timeoutMs: 300_000,
    });

    await runVerify({ cwd: tmpDir });

    const b64CallArgs = mockApiPost.mock.calls[0] as unknown[];
    const b64Call = b64CallArgs[1] as {
      files: Array<{ path: string; contentBase64: string }>;
    };
    expect(b64Call.files.length).toBeGreaterThan(0);
    expect(b64Call.files[0]?.contentBase64).toBeTruthy();
  });

  it('sends projectType in the request body', async () => {
    tmpDir = createTmpProjectDir();
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      packageName: '@my-scope/my-node',
      source: 'https://github.com/user/repo.git',
      include: ['src'],
      timeoutMs: 300_000,
    });

    await runVerify({ cwd: tmpDir });

    const callArgs = mockApiPost.mock.calls[0] as unknown[];
    const body = callArgs[1] as { projectType: string; packageName: string; source: string };
    expect(body.projectType).toBe('n8n-node');
    expect(body.packageName).toBe('@my-scope/my-node');
    expect(body.source).toBe('https://github.com/user/repo.git');
  });
});

// ─── npm package mode ─────────────────────────────────────────────────────────────────

describe('registerVerifyCommand — npm package mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFatal.mockImplementation((msg: string, code: number = 1) => {
      throw new Error(`fatal:${code}:${msg}`);
    });
    mockApiPost.mockResolvedValue({ runId: 'run-npm', status: 'queued', creditsEstimated: 1 });
    mockPoll.mockResolvedValue({ runId: 'run-npm', status: 'success' });
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/result')) {
        return Promise.resolve({
          runId: 'run-npm',
          passed: true,
          summary: 'All checks passed',
          checks: [],
          creditsUsed: 1,
        });
      }
      return Promise.resolve({ lines: [], nextCursor: '', done: true });
    });
  });

  it('scoped package (@scope/name) is recognised as an npm ref, not a file', async () => {
    const result = await runVerify({ file: '@scope/my-node', type: 'n8n-node' });
    expect(mockFatal).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
  });

  it('scoped package with version (@scope/name@1.2.3) is recognised as npm ref', async () => {
    const result = await runVerify({ file: '@scope/my-node@1.2.3', type: 'n8n-node' });
    expect(mockFatal).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
  });

  it('bare package name is recognised as npm ref', async () => {
    const result = await runVerify({ file: 'my-n8n-node', type: 'n8n-node' });
    expect(mockFatal).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
  });

  it('file path ending in .json is still blocked', async () => {
    const result = await runVerify({ file: 'workflow.json', type: 'n8n-node' });
    expect(mockFatal).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(2);
  });

  it('relative path ./foo is still blocked', async () => {
    const result = await runVerify({ file: './workflow.json' });
    expect(mockFatal).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(2);
  });

  it('requires --type when verifying an npm package', async () => {
    const result = await runVerify({ file: '@scope/my-node' });
    expect(mockFatal).toHaveBeenCalledWith(expect.stringContaining('--type is required'), 2);
    expect(result.exitCode).toBe(2);
  });

  it('sends packageRef in the request body, no files', async () => {
    await runVerify({ file: '@scope/my-node', type: 'n8n-node' });
    const callArgs = mockApiPost.mock.calls[0] as unknown[];
    const body = callArgs[1] as Record<string, unknown>;
    expect(body['packageRef']).toBe('@scope/my-node');
    expect(body['files']).toBeUndefined();
    expect(body['projectType']).toBe('n8n-node');
  });

  it('does not call resolveRunContext in npm package mode', async () => {
    await runVerify({ file: '@scope/my-node', type: 'n8n-node' });
    expect(mockResolveRunContext).not.toHaveBeenCalled();
  });

  it('logs "Verifying npm package" info message', async () => {
    await runVerify({ file: '@scope/my-node', type: 'n8n-node' });
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Verifying npm package'));
  });

  it('passes --ref to the request body when set', async () => {
    await runVerify({ file: '@scope/my-node', type: 'n8n-node', ref: 'v1.2.3' });
    const callArgs = mockApiPost.mock.calls[0] as unknown[];
    const body = callArgs[1] as Record<string, unknown>;
    expect(body['ref']).toBe('v1.2.3');
  });

  it('uses --timeout in npm package mode', async () => {
    await runVerify({ file: '@scope/my-node', type: 'n8n-node', timeout: '120' });
    const pollArgs = mockPoll.mock.calls[0] as unknown[];
    const pollOpts = pollArgs[0] as { timeoutMs: number };
    expect(pollOpts.timeoutMs).toBe(120_000);
  });

  it('rejects invalid --timeout in npm package mode', async () => {
    const result = await runVerify({ file: '@scope/my-node', type: 'n8n-node', timeout: '-5' });
    expect(mockFatal).toHaveBeenCalledWith(
      expect.stringContaining('--timeout must be a positive number'),
      2,
    );
    expect(result.exitCode).toBe(2);
  });
});

// ─── n8n-workflow type gate ───────────────────────────────────────────────────

describe('registerVerifyCommand — n8n-workflow type gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFatal.mockImplementation((msg: string, code: number = 1) => {
      throw new Error(`fatal:${code}:${msg}`);
    });
  });

  it('calls fatal with "not yet supported" for --type n8n-workflow', async () => {
    const result = await runVerify({ type: 'n8n-workflow' });
    expect(mockFatal).toHaveBeenCalledWith(
      expect.stringContaining('n8n-workflow verification is not yet supported'),
      2,
    );
    expect(result.exitCode).toBe(2);
  });
});

// ─── ctx.timeoutMs invalid from resolveRunContext ────────────────────────────

describe('registerVerifyCommand — invalid ctx.timeoutMs from resolveRunContext', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = createTmpProjectDir();
    mockResolveApiKey.mockReturnValue('pk_test_12345678');
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
    mockFatal.mockImplementation((msg: string, code: number = 1) => {
      throw new Error(`fatal:${code}:${msg}`);
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('calls fatal when resolveRunContext returns timeoutMs of 0', async () => {
    mockResolveRunContext.mockReturnValueOnce({
      projectType: 'n8n-node',
      include: ['src'],
      timeoutMs: 0,
    });
    const result = await runVerify({ cwd: tmpDir });
    expect(mockFatal).toHaveBeenCalledWith(
      expect.stringContaining('--timeout must be a positive number'),
      2,
    );
    expect(result.exitCode).toBe(2);
  });

  it('calls fatal when resolveRunContext returns negative timeoutMs', async () => {
    mockResolveRunContext.mockReturnValueOnce({
      projectType: 'n8n-node',
      include: ['src'],
      timeoutMs: -1_000,
    });
    const result = await runVerify({ cwd: tmpDir });
    expect(mockFatal).toHaveBeenCalledWith(
      expect.stringContaining('--timeout must be a positive number'),
      2,
    );
    expect(result.exitCode).toBe(2);
  });
});

// ─── rejected run handling ────────────────────────────────────────────────────

describe('registerVerifyCommand — rejected run', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = createTmpProjectDir();
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      packageName: 'test',
      source: undefined,
      include: ['src'],
      timeoutMs: 300_000,
    });
    mockResolveApiKey.mockReturnValue('pk_test_12345678');
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
    mockApiPost.mockResolvedValue({ runId: 'run-rej', status: 'queued', creditsEstimated: 1 });
    mockFatal.mockImplementation((msg: string, code: number = 1) => {
      throw new Error(`fatal:${code}:${msg}`);
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exits 1 and calls error when run is rejected (INSUFFICIENT_CREDITS, text mode)', async () => {
    mockPoll.mockResolvedValue({
      runId: 'run-rej',
      status: 'rejected',
      reasonCode: 'INSUFFICIENT_CREDITS',
    });
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(1);
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('Insufficient credits'));
  });

  it('exits 1 and calls error when run is rejected (NOT_IMPLEMENTED, text mode)', async () => {
    mockPoll.mockResolvedValue({
      runId: 'run-rej',
      status: 'rejected',
      reasonCode: 'NOT_IMPLEMENTED',
    });
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(1);
    expect(mockError).toHaveBeenCalled();
  });

  it('exits 1 and calls error when run is rejected (CONCURRENCY_CAP_REACHED, text mode)', async () => {
    mockPoll.mockResolvedValue({
      runId: 'run-rej',
      status: 'rejected',
      reasonCode: 'CONCURRENCY_CAP_REACHED',
    });
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(1);
    expect(mockError).toHaveBeenCalled();
  });

  it('exits 1 and calls error for unknown reasonCode (text mode)', async () => {
    mockPoll.mockResolvedValue({
      runId: 'run-rej',
      status: 'rejected',
      reasonCode: 'SOME_UNKNOWN_REASON',
    });
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(1);
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('SOME_UNKNOWN_REASON'));
  });

  it('exits 1 with RUNNER_ERROR message when reasonCode is absent (text mode)', async () => {
    mockPoll.mockResolvedValue({ runId: 'run-rej', status: 'rejected' });
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(1);
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('internal error'));
  });

  it('emits JSON with run_rejected when run is rejected (JSON mode)', async () => {
    mockPoll.mockResolvedValue({
      runId: 'run-rej',
      status: 'rejected',
      reasonCode: 'INSUFFICIENT_CREDITS',
    });
    const { exitCode } = await runVerify({ json: true, cwd: tmpDir });
    expect(exitCode).toBe(1);
    expect(mockEmitJson).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'run_rejected', reasonCode: 'INSUFFICIENT_CREDITS' }),
    );
  });
});

// ─── collectFiles: plain file in include list ────────────────────────────────

describe('registerVerifyCommand — collectFiles: plain file in include', () => {
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

  it('collects a single plain file listed in include', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-plain-'));
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test-pkg"}');
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      include: ['package.json'],
      timeoutMs: 300_000,
    });

    await runVerify({ cwd: tmpDir });

    const callArgs = mockApiPost.mock.calls[0] as unknown[];
    const body = callArgs[1] as { files: Array<{ path: string }> };
    expect(body.files.some((f) => f.path === 'package.json')).toBe(true);
  });

  it('skips a plain file larger than 500 KB in the include list', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-plain-large-'));
    const largeContent = Buffer.alloc(600_000, 'x');
    fs.writeFileSync(path.join(tmpDir, 'big.json'), largeContent);
    // Also write a small file so files.length > 0 after skip
    fs.writeFileSync(path.join(tmpDir, 'small.json'), '{}');
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      include: ['big.json', 'small.json'],
      timeoutMs: 300_000,
    });

    await runVerify({ cwd: tmpDir });

    expect(mockWarn).toHaveBeenCalled();
    const callArgs = mockApiPost.mock.calls[0] as unknown[];
    const body = callArgs[1] as { files: Array<{ path: string }> };
    expect(body.files.some((f) => f.path === 'big.json')).toBe(false);
    expect(body.files.some((f) => f.path === 'small.json')).toBe(true);
  });
});

// ─── collectFiles: recursive walkDir ─────────────────────────────────────────

describe('registerVerifyCommand — collectFiles: recursive walkDir', () => {
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

  it('recursively collects files from nested subdirectories', async () => {
    tmpDir = createTmpProjectDir();
    // Add a real nested subdirectory inside src/
    fs.mkdirSync(path.join(tmpDir, 'src', 'helpers'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'helpers', 'utils.ts'), 'export const x = 1;');
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      include: ['src'],
      timeoutMs: 300_000,
    });

    await runVerify({ cwd: tmpDir });

    const callArgs = mockApiPost.mock.calls[0] as unknown[];
    const body = callArgs[1] as { files: Array<{ path: string }> };
    expect(body.files.some((f) => f.path.includes('helpers/utils.ts'))).toBe(true);
  });
});

// ─── handleApiError: 503 service unavailable ─────────────────────────────────

describe('registerVerifyCommand — handleApiError: 503', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = createTmpProjectDir();
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      packageName: 'test',
      source: undefined,
      include: ['src'],
      timeoutMs: 300_000,
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

  it('handles 503 with "Service unavailable" message (text mode)', async () => {
    mockApiPost.mockRejectedValue(
      new ApiRequestError('Service temporarily down', 'service_unavailable', 503),
    );
    const { exitCode } = await runVerify({ cwd: tmpDir });
    expect(exitCode).toBe(1);
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('Service unavailable'));
  });
});

// ─── local mode: valid --timeout covers timeoutSec branch ────────────────────

describe('registerVerifyCommand — local mode with valid --timeout', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = createTmpProjectDir();
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      packageName: 'test',
      source: undefined,
      include: ['src'],
      timeoutMs: 120_000,
    });
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
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('passes timeoutSec to resolveRunContext when --timeout is provided in local mode', async () => {
    const { exitCode } = await runVerify({ timeout: '120', cwd: tmpDir });
    expect(exitCode).toBe(0);
    expect(mockResolveRunContext).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeoutSec: 120 }),
    );
  });
});

// ─── isNpmPackageArg: path-with-slashes is blocked ───────────────────────────

describe('registerVerifyCommand — isNpmPackageArg: slash-containing paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFatal.mockImplementation((msg: string, code: number = 1) => {
      throw new Error(`fatal:${code}:${msg}`);
    });
  });

  it('blocks a path containing forward slashes (e.g. "some/nested/file")', async () => {
    const result = await runVerify({ file: 'some/nested/file' });
    expect(mockFatal).toHaveBeenCalledWith(expect.stringContaining('not yet supported'), 2);
    expect(result.exitCode).toBe(2);
  });
});

// ─── printResult: failed check with message ───────────────────────────────────

describe('registerVerifyCommand — printResult: failed check with message', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = createTmpProjectDir();
    mockResolveRunContext.mockReturnValue({
      projectType: 'n8n-node',
      packageName: 'test',
      source: undefined,
      include: ['src'],
      timeoutMs: 300_000,
    });
    mockResolveApiKey.mockReturnValue('pk_test_12345678');
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
    mockApiPost.mockResolvedValue({ runId: 'run-123', status: 'queued', creditsEstimated: 1 });
    mockPoll.mockResolvedValue({ runId: 'run-123', status: 'failed' });
    mockFatal.mockImplementation((msg: string, code: number = 1) => {
      throw new Error(`fatal:${code}:${msg}`);
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('displays check message in info output when check has a message field', async () => {
    mockApiGet.mockResolvedValue({
      runId: 'run-123',
      passed: false,
      summary: 'Checks failed',
      checks: [
        { name: 'Security scan', passed: false, message: 'Found 2 critical vulnerabilities' },
        { name: 'Lint', passed: true },
      ],
      creditsUsed: 1,
    });
    await runVerify({ cwd: tmpDir });
    // info should have been called with a string containing the check message
    const infoCalls = mockInfo.mock.calls.map((c) => String(c[0]));
    expect(infoCalls.some((s) => s.includes('Found 2 critical vulnerabilities'))).toBe(true);
  });
});
