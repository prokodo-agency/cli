import { Command } from 'commander';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockLoadCredentials: jest.Mock = jest.fn(() => null);
const mockLoadConfig: jest.Mock = jest.fn(() => ({
  projectSlug: 'test-project',
  verifyGlobs: ['src/**/*'],
  timeout: 300,
}));
const mockGetDefaultApiUrl = jest.fn(() => 'https://test.invalid');
const mockResolveApiKey: jest.Mock = jest.fn(() => 'pk_test_1234567890');
const mockInfo = jest.fn();
const mockEmitJson = jest.fn();
const mockApiGet = jest.fn(async () => ({ status: 'ok', apiVersion: '1.0' }));
const MockApiClient = jest.fn(() => ({ get: mockApiGet }));

jest.mock('../lib/credentials', () => ({ loadCredentials: () => mockLoadCredentials() }));
jest.mock('../lib/config', () => ({ loadConfig: () => mockLoadConfig() }));
jest.mock('../lib/platform', () => ({ getDefaultApiUrl: () => mockGetDefaultApiUrl() }));
jest.mock('../lib/auth', () => ({
  resolveApiKey: (k?: string) => (mockResolveApiKey as jest.Mock)(k),
}));
jest.mock('../lib/logger', () => ({
  info: (...args: unknown[]) => mockInfo(...args),
  emitJson: (...args: unknown[]) => mockEmitJson(...args),
  success: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
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
jest.mock('picocolors', () => ({
  green: (s: string) => s,
  red: (s: string) => s,
  dim: (s: string) => s,
}));

import { registerDoctorCommand } from './doctor';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProgram(opts: { json?: boolean; apiUrl?: string; apiKey?: string } = {}): Command {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output', false);
  program.option('--api-url <url>', 'API URL');
  program.option('--api-key <key>', 'API key');
  // Set option values directly before parsing
  if (opts.json) program.setOptionValue('json', true);
  if (opts.apiUrl) program.setOptionValue('apiUrl', opts.apiUrl);
  if (opts.apiKey) program.setOptionValue('apiKey', opts.apiKey);
  return program;
}

async function runDoctor(
  opts: { json?: boolean; apiUrl?: string; apiKey?: string } = {},
  processEnv: Record<string, string | undefined> = {},
): Promise<void> {
  const savedEnv = { ...process.env };
  Object.assign(process.env, processEnv);

  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`exit:${String(code)}`);
  });

  try {
    const program = makeProgram(opts);
    registerDoctorCommand(program);
    await program.parseAsync(['node', 'prokodo', 'doctor']);
  } catch (err) {
    if (!(err instanceof Error && err.message.startsWith('exit:'))) throw err;
  } finally {
    Object.assign(process.env, savedEnv);
    Object.keys(processEnv).forEach((k) => {
      if (!(k in savedEnv)) delete process.env[k];
    });
    exitSpy.mockRestore();
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerDoctorCommand — basic smoke', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadCredentials.mockReturnValue(null);
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
    mockResolveApiKey.mockReturnValue('pk_test_1234567890');
    mockApiGet.mockResolvedValue({ status: 'ok', apiVersion: '1.0' });
    globalThis.fetch = async (): Promise<Response> =>
      ({
        ok: true,
        json: async () => ({ status: 'ok', apiVersion: '1.0' }),
      }) as unknown as Response;
  });

  it('runs without throwing when all checks pass', async () => {
    await expect(runDoctor()).resolves.not.toThrow();
  });

  it('displays all-passed message in text mode when all checks pass', async () => {
    // Provide credentials so the credentials check passes
    mockLoadCredentials.mockReturnValue({ apiKey: 'pk_file_key_1234567890' });
    await runDoctor({ json: false });
    const allInfoCalls = mockInfo.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(allInfoCalls.some((s) => s.includes('All checks passed'))).toBe(true);
  });

  it('calls info for each check in text mode', async () => {
    await runDoctor();
    expect(mockInfo).toHaveBeenCalled();
  });

  it('prints failure summary in text mode when a check fails', async () => {
    // Make the raw API reachability fetch fail so that check does not pass
    globalThis.fetch = async (): Promise<Response> => {
      throw new Error('connection refused');
    };
    await runDoctor({ json: false });
    const allInfoCalls = mockInfo.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(allInfoCalls.some((s) => s.includes('check(s) failed'))).toBe(true);
  });

  it('calls emitJson in JSON mode', async () => {
    await runDoctor({ json: true });
    expect(mockEmitJson).toHaveBeenCalledWith(
      expect.objectContaining({ passed: expect.any(Boolean), checks: expect.any(Array) }),
    );
  });

  it('JSON output has a checks array', async () => {
    await runDoctor({ json: true });
    const call = mockEmitJson.mock.calls[0]?.[0] as { checks: unknown[] };
    expect(Array.isArray(call.checks)).toBe(true);
    expect(call.checks.length).toBeGreaterThan(0);
  });
});

describe('registerDoctorCommand — credentials detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadCredentials.mockReturnValue(null);
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
    mockResolveApiKey.mockReturnValue('pk_test_1234567890');
    globalThis.fetch = async (): Promise<Response> =>
      ({
        ok: true,
        json: async () => ({ status: 'ok', apiVersion: '1.0' }),
      }) as unknown as Response;
    mockApiGet.mockResolvedValue({ status: 'ok', apiVersion: '1.0' });
  });

  it('detects credentials from env var', async () => {
    await runDoctor({ json: true }, { PROKODO_API_KEY: 'pk_env_key_test' });
    const call = mockEmitJson.mock.calls[0]?.[0] as {
      checks: Array<{ name: string; detail: string }>;
    };
    const credCheck = call.checks.find((c) => c.name === 'API key configured');
    expect(credCheck?.detail).toContain('PROKODO_API_KEY env var');
  });

  it('detects credentials from file', async () => {
    mockLoadCredentials.mockReturnValue({ apiKey: 'pk_file_1234' });
    await runDoctor({ json: true });
    const call = mockEmitJson.mock.calls[0]?.[0] as {
      checks: Array<{ name: string; detail: string }>;
    };
    const credCheck = call.checks.find((c) => c.name === 'API key configured');
    expect(credCheck?.detail).toContain('credentials file');
  });

  it('detects credentials from --api-key flag', async () => {
    await runDoctor({ json: true, apiKey: 'pk_flag_key_1234' });
    const call = mockEmitJson.mock.calls[0]?.[0] as {
      checks: Array<{ name: string; detail: string }>;
    };
    const credCheck = call.checks.find((c) => c.name === 'API key configured');
    expect(credCheck?.detail).toContain('--api-key flag');
  });

  it('reports no credentials source when none configured', async () => {
    const savedKey = process.env['PROKODO_API_KEY'];
    delete process.env['PROKODO_API_KEY'];
    await runDoctor({ json: true });
    if (savedKey !== undefined) process.env['PROKODO_API_KEY'] = savedKey;
    const call = mockEmitJson.mock.calls[0]?.[0] as {
      checks: Array<{ name: string; detail: string; passed: boolean }>;
    };
    const credCheck = call.checks.find((c) => c.name === 'API key configured');
    expect(credCheck?.passed).toBe(false);
  });
});

describe('registerDoctorCommand — config file check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadCredentials.mockReturnValue(null);
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
    mockResolveApiKey.mockReturnValue('pk_test_1234567890');
    globalThis.fetch = async (): Promise<Response> =>
      ({
        ok: true,
        json: async () => ({ status: 'ok', apiVersion: '1.0' }),
      }) as unknown as Response;
    mockApiGet.mockResolvedValue({ status: 'ok', apiVersion: '1.0' });
  });

  it('marks config check as passed when config loads successfully', async () => {
    mockLoadConfig.mockReturnValue({
      projectSlug: 'my-proj',
      verifyGlobs: ['src/**'],
      timeout: 300,
    });
    await runDoctor({ json: true });
    const call = mockEmitJson.mock.calls[0]?.[0] as {
      checks: Array<{ name: string; passed: boolean }>;
    };
    const cfgCheck = call.checks.find((c) => c.name === '.prokodo/config.json');
    expect(cfgCheck?.passed).toBe(true);
  });

  it('marks config check as failed when loadConfig throws', async () => {
    mockLoadConfig.mockImplementation(() => {
      throw new Error('No config found');
    });
    await runDoctor({ json: true });
    const call = mockEmitJson.mock.calls[0]?.[0] as {
      checks: Array<{ name: string; passed: boolean }>;
    };
    const cfgCheck = call.checks.find((c) => c.name === '.prokodo/config.json');
    expect(cfgCheck?.passed).toBe(false);
  });
});

describe('registerDoctorCommand — API reachability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadCredentials.mockReturnValue(null);
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
    mockResolveApiKey.mockReturnValue('pk_test_1234567890');
    mockApiGet.mockResolvedValue({ status: 'ok', apiVersion: '1.0' });
  });

  it('marks API reachability as passed when fetch returns ok', async () => {
    globalThis.fetch = async (): Promise<Response> =>
      ({
        ok: true,
        json: async () => ({ status: 'ok', apiVersion: '1.0' }),
      }) as unknown as Response;
    await runDoctor({ json: true });
    const call = mockEmitJson.mock.calls[0]?.[0] as {
      checks: Array<{ name: string; passed: boolean }>;
    };
    const apiCheck = call.checks.find((c) => c.name === 'API reachability');
    expect(apiCheck?.passed).toBe(true);
  });

  it('marks API reachability as failed when fetch throws', async () => {
    globalThis.fetch = async (): Promise<Response> => {
      throw new Error('ECONNREFUSED');
    };
    await runDoctor({ json: true });
    const call = mockEmitJson.mock.calls[0]?.[0] as {
      checks: Array<{ name: string; passed: boolean }>;
    };
    const apiCheck = call.checks.find((c) => c.name === 'API reachability');
    expect(apiCheck?.passed).toBe(false);
  });

  it('marks API reachability as failed when response is not ok', async () => {
    globalThis.fetch = async (): Promise<Response> =>
      ({
        ok: false,
        status: 503,
        json: async () => ({}),
      }) as unknown as Response;
    await runDoctor({ json: true });
    const call = mockEmitJson.mock.calls[0]?.[0] as {
      checks: Array<{ name: string; passed: boolean; detail: string }>;
    };
    const apiCheck = call.checks.find((c) => c.name === 'API reachability');
    expect(apiCheck?.passed).toBe(false);
    expect(apiCheck?.detail).toContain('503');
  });
});

describe('registerDoctorCommand — auth key check', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
    mockResolveApiKey.mockReturnValue('pk_test_1234567890');
    globalThis.fetch = async (): Promise<Response> =>
      ({
        ok: true,
        json: async () => ({ status: 'ok', apiVersion: '1.0' }),
      }) as unknown as Response;
  });

  it('skips API key valid check when no key is configured', async () => {
    mockLoadCredentials.mockReturnValue(null);
    const savedKey = process.env['PROKODO_API_KEY'];
    delete process.env['PROKODO_API_KEY'];
    await runDoctor({ json: true });
    if (savedKey !== undefined) process.env['PROKODO_API_KEY'] = savedKey;
    const call = mockEmitJson.mock.calls[0]?.[0] as {
      checks: Array<{ name: string }>;
    };
    const authKeyCheck = call.checks.find((c) => c.name === 'API key valid');
    expect(authKeyCheck).toBeUndefined();
  });

  it('runs API key valid check when credentials file has a key', async () => {
    mockLoadCredentials.mockReturnValue({ apiKey: 'pk_file_key_12345' });
    mockApiGet.mockResolvedValue({ status: 'ok', apiVersion: '1.0' });
    await runDoctor({ json: true });
    const call = mockEmitJson.mock.calls[0]?.[0] as {
      checks: Array<{ name: string; passed: boolean }>;
    };
    const authKeyCheck = call.checks.find((c) => c.name === 'API key valid');
    expect(authKeyCheck).toBeDefined();
    expect(authKeyCheck?.passed).toBe(true);
  });

  it('marks API key valid as failed when client.get throws', async () => {
    mockLoadCredentials.mockReturnValue({ apiKey: 'pk_bad_key_12345' });
    mockApiGet.mockRejectedValue(new Error('Unauthorized'));
    await runDoctor({ json: true });
    const call = mockEmitJson.mock.calls[0]?.[0] as {
      checks: Array<{ name: string; passed: boolean }>;
    };
    const authKeyCheck = call.checks.find((c) => c.name === 'API key valid');
    expect(authKeyCheck?.passed).toBe(false);
  });
});

describe('registerDoctorCommand — exit code', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadConfig.mockReturnValue({
      projectSlug: 'test',
      verifyGlobs: ['src/**/*'],
      timeout: 300,
    });
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
    mockResolveApiKey.mockReturnValue('pk_test_1234567890');
    mockLoadCredentials.mockReturnValue(null);
  });

  it('exits 0 when all checks pass', async () => {
    globalThis.fetch = async (): Promise<Response> =>
      ({
        ok: true,
        json: async () => ({ status: 'ok', apiVersion: '1.0' }),
      }) as unknown as Response;
    mockApiGet.mockResolvedValue({ status: 'ok', apiVersion: '1.0' });
    mockLoadCredentials.mockReturnValue({ apiKey: 'pk_file_key_12345' });

    let exitCode: number | undefined;
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code as number;
      throw new Error(`exit:${String(code)}`);
    });
    try {
      const program = makeProgram({ json: true });
      registerDoctorCommand(program);
      await program.parseAsync(['node', 'prokodo', 'doctor']);
    } catch {
      // swallow exit
    } finally {
      exitSpy.mockRestore();
    }
    expect(exitCode).toBe(0);
  });

  it('exits 1 when some checks fail', async () => {
    globalThis.fetch = async (): Promise<Response> => {
      throw new Error('network fail');
    };
    mockLoadConfig.mockImplementation(() => {
      throw new Error('no config');
    });

    let exitCode: number | undefined;
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      exitCode = code as number;
      throw new Error(`exit:${String(code)}`);
    });
    try {
      const program = makeProgram({ json: true });
      registerDoctorCommand(program);
      await program.parseAsync(['node', 'prokodo', 'doctor']);
    } catch {
      // swallow exit
    } finally {
      exitSpy.mockRestore();
    }
    expect(exitCode).toBe(1);
  });
});
