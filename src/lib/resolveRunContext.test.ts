import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveRunContext } from './resolveRunContext';
import { DEFAULT_INCLUDE, DEFAULT_TIMEOUT_MS } from '../types/project';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockExecSync = jest.fn();

jest.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mkTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-ctx-'));
}

function writePkg(dir: string, pkg: object): void {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
}

function writeConfig(dir: string, cfg: object): void {
  fs.mkdirSync(path.join(dir, '.prokodo'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.prokodo', 'config.json'), JSON.stringify(cfg));
}

// ─── readPackageJson (exercised via resolveRunContext) ────────────────────────

describe('resolveRunContext — readPackageJson: no package.json', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = mkTmpDir();
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns undefined packageName when package.json is absent', () => {
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.packageName).toBeUndefined();
  });

  it('uses n8n-node as default projectType when no package.json', () => {
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.projectType).toBe('n8n-node');
  });
});

describe('resolveRunContext — readPackageJson: valid package.json', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = mkTmpDir();
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads packageName from package.json', () => {
    writePkg(tmpDir, { name: 'my-n8n-node' });
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.packageName).toBe('my-n8n-node');
  });

  it('keeps packageName undefined when name field is absent', () => {
    writePkg(tmpDir, { version: '1.0.0' });
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.packageName).toBeUndefined();
  });
});

describe('resolveRunContext — readPackageJson: malformed JSON', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = mkTmpDir();
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('silently returns undefined pkg when package.json contains invalid JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{ INVALID JSON }');
    // Should not throw; falls back to safe defaults
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.packageName).toBeUndefined();
    expect(ctx.projectType).toBe('n8n-node');
  });
});

// ─── detectProjectType (exercised via resolveRunContext) ──────────────────────

describe('resolveRunContext — detectProjectType: no pkg (default)', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = mkTmpDir();
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('defaults to n8n-node when pkg is undefined', () => {
    // No package.json in tmpDir
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.projectType).toBe('n8n-node');
  });
});

describe('resolveRunContext — detectProjectType: pkg with n8n deps', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = mkTmpDir();
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns n8n-node for pkg with n8n-core in dependencies', () => {
    writePkg(tmpDir, { name: 'test', dependencies: { 'n8n-core': '1.0.0' } });
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.projectType).toBe('n8n-node');
  });

  it('returns n8n-node for pkg with n8n in devDependencies', () => {
    writePkg(tmpDir, { name: 'test', devDependencies: { n8n: '1.0.0' } });
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.projectType).toBe('n8n-node');
  });

  it('returns n8n-node for pkg with n8n-workflow-base in peerDependencies', () => {
    writePkg(tmpDir, {
      name: 'test',
      peerDependencies: { 'n8n-workflow-base': '1.0.0' },
    });
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.projectType).toBe('n8n-node');
  });

  it('returns n8n-node (safe default) for pkg with no n8n deps', () => {
    writePkg(tmpDir, { name: 'test', dependencies: { lodash: '4.0.0' } });
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.projectType).toBe('n8n-node');
  });
});

// ─── detectGitSource (exercised via resolveRunContext) ────────────────────────

describe('resolveRunContext — detectGitSource', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = mkTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('captures git remote origin URL when execSync succeeds', () => {
    mockExecSync.mockReturnValue(Buffer.from('https://github.com/user/repo.git\n'));
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.source).toBe('https://github.com/user/repo.git');
  });

  it('returns undefined source when execSync throws', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('fatal: not a git repository');
    });
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.source).toBeUndefined();
  });

  it('returns undefined source when execSync returns empty string', () => {
    mockExecSync.mockReturnValue(Buffer.from(''));
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.source).toBeUndefined();
  });
});

// ─── resolveRunContext — priority chain ───────────────────────────────────────

describe('resolveRunContext — override.projectType wins over everything', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = mkTmpDir();
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('override.projectType takes precedence over config.projectType', () => {
    writeConfig(tmpDir, { projectType: 'n8n-node' });
    const ctx = resolveRunContext(tmpDir, { projectType: 'n8n-workflow' });
    expect(ctx.projectType).toBe('n8n-workflow');
  });

  it('override.projectType takes precedence over auto-detection', () => {
    writePkg(tmpDir, { name: 'test', devDependencies: { n8n: '1.0.0' } });
    const ctx = resolveRunContext(tmpDir, { projectType: 'n8n-workflow' });
    expect(ctx.projectType).toBe('n8n-workflow');
  });
});

describe('resolveRunContext — config.projectType wins over auto-detection', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = mkTmpDir();
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('config.projectType is used when no override is provided', () => {
    writeConfig(tmpDir, { projectType: 'n8n-node' });
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.projectType).toBe('n8n-node');
  });
});

// ─── resolveRunContext — include resolution ────────────────────────────────────

describe('resolveRunContext — include resolution', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = mkTmpDir();
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses DEFAULT_INCLUDE when config has no include', () => {
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.include).toEqual(DEFAULT_INCLUDE['n8n-node']);
  });

  it('uses config.include when it is set', () => {
    writeConfig(tmpDir, { include: ['lib', 'index.js'] });
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.include).toEqual(['lib', 'index.js']);
  });

  it('uses DEFAULT_INCLUDE when config.include is an empty array', () => {
    writeConfig(tmpDir, { include: [] });
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.include).toEqual(DEFAULT_INCLUDE['n8n-node']);
  });
});

// ─── resolveRunContext — timeout resolution ────────────────────────────────────

describe('resolveRunContext — timeout resolution', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = mkTmpDir();
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses override.timeoutSec (converted to ms) when provided', () => {
    const ctx = resolveRunContext(tmpDir, { timeoutSec: 60 });
    expect(ctx.timeoutMs).toBe(60_000);
  });

  it('uses config.timeout (converted to ms) when no override', () => {
    writeConfig(tmpDir, { timeout: 120 });
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.timeoutMs).toBe(120_000);
  });

  it('uses DEFAULT_TIMEOUT_MS when neither override nor config has timeout', () => {
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
  });
});

// ─── resolveRunContext — resilience to bad config ─────────────────────────────

describe('resolveRunContext — resilience', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = mkTmpDir();
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repo');
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles malformed config.json gracefully (uses empty config fallback)', () => {
    fs.mkdirSync(path.join(tmpDir, '.prokodo'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.prokodo', 'config.json'), '{ INVALID }');
    // Should not throw
    const ctx = resolveRunContext(tmpDir);
    expect(ctx.projectType).toBe('n8n-node');
    expect(ctx.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('defaults cwd to process.cwd() when not provided', () => {
    // Simply ensuring it does not throw and returns a valid context
    // We mock execSync to avoid git calls in the actual cwd
    expect(() => resolveRunContext()).not.toThrow();
  });
});
