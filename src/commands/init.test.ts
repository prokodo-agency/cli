import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockIsInteractive = jest.fn(() => false);
const mockSuccess = jest.fn();
const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockFatal = jest.fn();
const mockEmitJson = jest.fn();

// Mock readline so the interactive prompt resolves immediately
const mockRlQuestion = jest.fn((q: string, cb: (a: string) => void) => cb('interactive-slug'));
const mockRlClose = jest.fn();
jest.mock('node:readline', () => ({
  createInterface: jest.fn(() => ({ question: mockRlQuestion, close: mockRlClose })),
}));

jest.mock('../lib/platform', () => ({
  isInteractive: () => mockIsInteractive(),
  getDefaultApiUrl: jest.fn(() => 'https://test.invalid'),
}));
jest.mock('../lib/logger', () => ({
  success: (...args: unknown[]) => mockSuccess(...args),
  info: (...args: unknown[]) => mockInfo(...args),
  warn: (...args: unknown[]) => mockWarn(...args),
  fatal: (...args: unknown[]) => mockFatal(...args),
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
  slug?: string;
  defaults?: boolean;
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
    if (opts.slug) args.push('--slug', opts.slug);
    if (opts.defaults) args.push('--defaults');
    if (opts.force) args.push('--force');

    await program.parseAsync(args);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('exit:')) {
      exitCode = Number(err.message.slice(5));
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

describe('registerInitCommand — --slug option', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-init-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates config file with provided slug', async () => {
    await runInit({ slug: 'my-project', cwd: tmpDir });
    const configFile = path.join(tmpDir, '.prokodo', 'config.json');
    expect(fs.existsSync(configFile)).toBe(true);
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8')) as { projectSlug: string };
    expect(cfg.projectSlug).toBe('my-project');
  });

  it('calls success in text mode', async () => {
    await runInit({ slug: 'test-slug', cwd: tmpDir });
    expect(mockSuccess).toHaveBeenCalled();
  });

  it('emits JSON when --json flag is set', async () => {
    await runInit({ slug: 'test-slug', json: true, cwd: tmpDir });
    expect(mockEmitJson).toHaveBeenCalledWith(
      expect.objectContaining({ created: true, path: expect.any(String) }),
    );
  });

  it('trims whitespace from slug', async () => {
    await runInit({ slug: '  trimmed-slug  ', cwd: tmpDir });
    const configFile = path.join(tmpDir, '.prokodo', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8')) as { projectSlug: string };
    expect(cfg.projectSlug).toBe('trimmed-slug');
  });
});

describe('registerInitCommand — --defaults option', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-init-defaults-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('derives slug from directory name when --defaults is used', async () => {
    const slugDir = path.join(tmpDir, 'my-cool-project');
    fs.mkdirSync(slugDir);

    await runInit({ defaults: true, cwd: slugDir });

    const configFile = path.join(slugDir, '.prokodo', 'config.json');
    expect(fs.existsSync(configFile)).toBe(true);
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8')) as { projectSlug: string };
    expect(cfg.projectSlug).toBe('my-cool-project');
  });

  it('derives slug from directory name when non-interactive', async () => {
    mockIsInteractive.mockReturnValue(false);
    const slugDir = path.join(tmpDir, 'auto-slug-dir');
    fs.mkdirSync(slugDir);

    await runInit({ cwd: slugDir });

    const configFile = path.join(slugDir, '.prokodo', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8')) as { projectSlug: string };
    expect(cfg.projectSlug).toBe('auto-slug-dir');
  });

  it('sanitises directory name to lowercase-dashes', async () => {
    const slugDir = path.join(tmpDir, 'My_Special Project');
    fs.mkdirSync(slugDir);

    await runInit({ defaults: true, cwd: slugDir });

    const configFile = path.join(slugDir, '.prokodo', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8')) as { projectSlug: string };
    expect(cfg.projectSlug).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('registerInitCommand — interactive mode', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset readline mock to provide a valid slug
    mockRlQuestion.mockImplementation((_q: string, cb: (a: string) => void) =>
      cb('interactive-slug'),
    );
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-init-interactive-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses interactive prompt when no --slug or --defaults and isInteractive=true', async () => {
    mockIsInteractive.mockReturnValue(true);
    await runInit({ cwd: tmpDir });
    const configFile = path.join(tmpDir, '.prokodo', 'config.json');
    expect(fs.existsSync(configFile)).toBe(true);
    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8')) as { projectSlug: string };
    expect(cfg.projectSlug).toBe('interactive-slug');
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

  it('warns and does not create new config when config exists without --force', async () => {
    // Create existing config
    fs.mkdirSync(path.join(tmpDir, '.prokodo'), { recursive: true });
    const existingCfg = JSON.stringify(
      { projectSlug: 'existing', verifyGlobs: ['src/**'], timeout: 300 },
      null,
      2,
    );
    fs.writeFileSync(path.join(tmpDir, '.prokodo', 'config.json'), existingCfg);

    await runInit({ slug: 'new-slug', cwd: tmpDir });

    // warn should be called for the conflict message
    expect(mockWarn).toHaveBeenCalled();
  });

  it('overwrites config when --force is used', async () => {
    // Create existing config
    fs.mkdirSync(path.join(tmpDir, '.prokodo'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.prokodo', 'config.json'),
      JSON.stringify({ projectSlug: 'old', verifyGlobs: ['src/**'], timeout: 300 }, null, 2),
    );

    await runInit({ slug: 'new-slug', force: true, cwd: tmpDir });

    const cfg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.prokodo', 'config.json'), 'utf8'),
    ) as { projectSlug: string };
    expect(cfg.projectSlug).toBe('new-slug');
  });
});
