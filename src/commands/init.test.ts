import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSuccess = jest.fn();
const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockFatal = jest.fn((msg: string, code: number = 1) => {
  throw new Error(`fatal:${code}:${msg}`);
});
const mockEmitJson = jest.fn();

jest.mock('../lib/logger', () => ({
  success: (...args: unknown[]) => mockSuccess(...args),
  info: (...args: unknown[]) => mockInfo(...args),
  warn: (...args: unknown[]) => mockWarn(...args),
  fatal: (msg: string, code?: number) => mockFatal(msg, code),
  emitJson: (...args: unknown[]) => mockEmitJson(...args),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('picocolors', () => ({
  green: (s: string) => s,
  red: (s: string) => s,
  dim: (s: string) => s,
  yellow: (s: string) => s,
}));

import { registerInitCommand } from './init';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProgram(): Command {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'JSON output', false);
  program.option('--api-url <url>', 'API URL');
  program.option('--api-key <key>', 'API key');
  return program;
}

interface RunInitOptions {
  type?: string;
  force?: boolean;
  json?: boolean;
  cwd?: string;
}

async function runInit(opts: RunInitOptions = {}): Promise<{ exitCode?: number }> {
  const savedCwd = process.cwd();
  if (opts.cwd) process.chdir(opts.cwd);

  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`exit:${String(code)}`);
  });

  let exitCode: number | undefined;

  try {
    const program = makeProgram();
    if (opts.json) program.setOptionValue('json', true);
    registerInitCommand(program);

    const args = ['node', 'prokodo', 'init'];
    if (opts.type) args.push('--type', opts.type);
    if (opts.force) args.push('--force');

    await program.parseAsync(args);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('exit:')) {
      exitCode = Number(err.message.slice(5));
    } else if (err instanceof Error && err.message.startsWith('fatal:')) {
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerInitCommand — basic creation', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-init-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates an empty config file without --type', async () => {
    await runInit({ cwd: tmpDir });
    const configFile = path.join(tmpDir, '.prokodo', 'config.json');
    expect(fs.existsSync(configFile)).toBe(true);
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8')) as Record<string, unknown>;
    expect(cfg).toEqual({});
  });

  it('creates config with projectType when --type n8n-node is given', async () => {
    await runInit({ type: 'n8n-node', cwd: tmpDir });
    const cfg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.prokodo', 'config.json'), 'utf8'),
    ) as { projectType: string };
    expect(cfg.projectType).toBe('n8n-node');
  });

  // TODO: re-enable once n8n-workflow verification is implemented
  it.skip('creates config with projectType when --type n8n-workflow is given', async () => {
    await runInit({ type: 'n8n-workflow', cwd: tmpDir });
    const cfg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.prokodo', 'config.json'), 'utf8'),
    ) as { projectType: string };
    expect(cfg.projectType).toBe('n8n-workflow');
  });

  it('calls success in text mode', async () => {
    await runInit({ cwd: tmpDir });
    expect(mockSuccess).toHaveBeenCalled();
  });

  it('emits JSON when --json flag is set', async () => {
    await runInit({ type: 'n8n-node', json: true, cwd: tmpDir });
    expect(mockEmitJson).toHaveBeenCalledWith(
      expect.objectContaining({ created: true, path: expect.any(String) }),
    );
  });

  it('shows auto-detect notice in text mode when no type given', async () => {
    await runInit({ cwd: tmpDir });
    const msgs = mockInfo.mock.calls.map((c) => String(c[0]));
    expect(msgs.some((m) => m.includes('auto-detected'))).toBe(true);
  });

  it('shows projectType in text mode when --type given', async () => {
    await runInit({ type: 'n8n-node', cwd: tmpDir });
    const msgs = mockInfo.mock.calls.map((c) => String(c[0]));
    expect(msgs.some((m) => m.includes('n8n-node'))).toBe(true);
  });
});

describe('registerInitCommand — invalid --type', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-init-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('calls fatal when --type is invalid', async () => {
    try {
      await runInit({ type: 'unknown-type', cwd: tmpDir });
    } catch {
      // expected
    }
    expect(mockFatal).toHaveBeenCalled();
  });

  it('does not create config file on invalid type', async () => {
    try {
      await runInit({ type: 'invalid', cwd: tmpDir });
    } catch {
      // expected
    }
    expect(fs.existsSync(path.join(tmpDir, '.prokodo', 'config.json'))).toBe(false);
  });

  it('calls fatal with "not yet supported" for --type n8n-workflow', async () => {
    const result = await runInit({ type: 'n8n-workflow', cwd: tmpDir });
    expect(mockFatal).toHaveBeenCalledWith(
      expect.stringContaining('n8n-workflow is not yet supported'),
      2,
    );
    expect(result.exitCode).toBe(2);
  });
});

describe('registerInitCommand — existing config', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-init-exist-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('warns and does not overwrite when config exists without --force', async () => {
    fs.mkdirSync(path.join(tmpDir, '.prokodo'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.prokodo', 'config.json'),
      JSON.stringify({ projectType: 'n8n-node' }, null, 2),
    );

    await runInit({ cwd: tmpDir });

    expect(mockWarn).toHaveBeenCalled();
    const cfg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.prokodo', 'config.json'), 'utf8'),
    ) as { projectType: string };
    expect(cfg.projectType).toBe('n8n-node');
  });

  it('overwrites config when --force is used', async () => {
    fs.mkdirSync(path.join(tmpDir, '.prokodo'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.prokodo', 'config.json'),
      JSON.stringify({ projectType: 'n8n-node' }, null, 2),
    );

    // Overwrite with an empty config (auto-detect at verify time)
    await runInit({ force: true, cwd: tmpDir });

    const cfg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.prokodo', 'config.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(cfg).toEqual({});
  });

  it('emits JSON with created: true on force overwrite', async () => {
    fs.mkdirSync(path.join(tmpDir, '.prokodo'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.prokodo', 'config.json'),
      JSON.stringify({ projectType: 'n8n-node' }, null, 2),
    );

    await runInit({ force: true, json: true, cwd: tmpDir });

    expect(mockEmitJson).toHaveBeenCalledWith(expect.objectContaining({ created: true }));
  });
});
