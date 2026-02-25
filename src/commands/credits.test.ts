import { Command } from 'commander';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockResolveApiKey: jest.Mock = jest.fn(() => 'pk_test_12345678');
const mockGetDefaultApiUrl: jest.Mock = jest.fn(() => 'https://test.invalid');
const mockInfo = jest.fn();
const mockEmitJson = jest.fn();
const mockApiGet = jest.fn(async () => ({ balance: 42, unit: 'credit', stub: false }));
const MockApiClient = jest.fn(() => ({ get: mockApiGet }));

jest.mock('../lib/auth', () => ({
  resolveApiKey: (k?: string) => mockResolveApiKey(k),
}));
jest.mock('../lib/platform', () => ({
  getDefaultApiUrl: () => mockGetDefaultApiUrl(),
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

import { registerCreditsCommand } from './credits';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output', false);
  program.option('--api-url <url>', 'API URL');
  program.option('--api-key <key>', 'API key');
  return program;
}

async function runCredits(opts: { json?: boolean; apiKey?: string } = {}): Promise<void> {
  const program = makeProgram();
  if (opts.json) program.setOptionValue('json', true);
  if (opts.apiKey) program.setOptionValue('apiKey', opts.apiKey);
  registerCreditsCommand(program);
  await program.parseAsync(['node', 'prokodo', 'credits']);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerCreditsCommand — text mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveApiKey.mockReturnValue('pk_test_12345678');
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
  });

  it('displays balance with unit in text mode', async () => {
    mockApiGet.mockResolvedValue({ balance: 100, unit: 'credit', stub: false });
    await runCredits();
    const allInfo = mockInfo.mock.calls.flat().join(' ');
    expect(allInfo).toContain('100');
    expect(allInfo).toContain('credit');
  });

  it('includes stub note when stub=true', async () => {
    mockApiGet.mockResolvedValue({ balance: 0, unit: 'credit', stub: true });
    await runCredits();
    const allInfo = mockInfo.mock.calls.flat().join(' ');
    expect(allInfo).toContain('preview');
  });

  it('does not include stub note when stub=false', async () => {
    mockApiGet.mockResolvedValue({ balance: 50, unit: 'credit', stub: false });
    await runCredits();
    const allInfo = mockInfo.mock.calls.flat().join(' ');
    expect(allInfo).not.toContain('preview');
  });
});

describe('registerCreditsCommand — JSON mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveApiKey.mockReturnValue('pk_test_12345678');
    mockGetDefaultApiUrl.mockReturnValue('https://test.invalid');
  });

  it('emits JSON with balance field', async () => {
    mockApiGet.mockResolvedValue({ balance: 75, unit: 'credit', stub: false });
    await runCredits({ json: true });
    expect(mockEmitJson).toHaveBeenCalledWith(
      expect.objectContaining({ balance: 75, unit: 'credit' }),
    );
  });

  it('does not call info when in JSON mode', async () => {
    mockApiGet.mockResolvedValue({ balance: 10, unit: 'credit', stub: false });
    await runCredits({ json: true });
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it('emits JSON with stub field', async () => {
    mockApiGet.mockResolvedValue({ balance: 0, unit: 'credit', stub: true });
    await runCredits({ json: true });
    expect(mockEmitJson).toHaveBeenCalledWith(expect.objectContaining({ stub: true }));
  });
});

describe('registerCreditsCommand — API client setup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGet.mockResolvedValue({ balance: 5, unit: 'credit', stub: false });
  });

  it('resolves API key via resolveApiKey', async () => {
    mockResolveApiKey.mockReturnValue('pk_resolved_12345');
    await runCredits();
    expect(mockResolveApiKey).toHaveBeenCalledTimes(1);
    expect(MockApiClient).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'pk_resolved_12345' }),
    );
  });

  it('calls client.get on the credits endpoint', async () => {
    await runCredits();
    expect(mockApiGet).toHaveBeenCalledWith('/api/cli/v1/credits');
  });

  it('uses custom apiUrl when provided', async () => {
    const program = makeProgram();
    program.setOptionValue('apiUrl', 'https://custom.invalid');
    registerCreditsCommand(program);
    await program.parseAsync(['node', 'prokodo', 'credits']);
    expect(MockApiClient).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://custom.invalid' }),
    );
  });
});
