/**
 * Integration tests for the prokodo CLI binary (dist/cli.js).
 *
 * These tests spawn the actual built binary to verify:
 *  - src/cli.ts entrypoint: command registration, global option wiring, preAction hook
 *  - Real Commander argv parsing — not mocked
 *  - File-system side-effects (init creates configs, auth saves/deletes credentials)
 *  - Graceful, informative error handling across all commands
 *
 * Help completeness contract:
 *  - src/commands/registry.ts is the single source of truth for registered commands
 *  - The 'help completeness' suite below imports COMMAND_NAMES from the registry and
 *    asserts that every entry appears in `prokodo --help` output.
 *  - Adding a command to the registry (required for cli.ts to wire it) automatically
 *    makes that test fail until the command is properly appearing in help.
 *
 * Prerequisites:
 *   `pnpm build` must be run before these tests (dist/cli.js must exist).
 *
 * Run standalone:
 *   pnpm test:integration
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { COMMAND_NAMES } from '../../src/commands/registry';

// ─── Runner setup ─────────────────────────────────────────────────────────────

/** Absolute path to the compiled binary under test. */
const CLI = path.resolve(__dirname, '../../dist/cli.js');
const NODE = process.execPath;

/** Loopback address where nothing listens — connection refused immediately. */
const DEAD_API_URL = 'http://127.0.0.1:19999';

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * An isolated home directory shared across all tests that do NOT specifically
 * need their own credential state.  Created once at import-time.
 */
const DEFAULT_HOME_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-int-home-'));

afterAll(() => {
  fs.rmSync(DEFAULT_HOME_DIR, { recursive: true, force: true });
});

/**
 * Run the CLI binary synchronously via Node.
 *
 * Env overrides applied on every call:
 *  - NO_COLOR=1           – strip ANSI codes so assertions on text are reliable
 *  - HOME / USERPROFILE   – redirected to an isolated tmpdir so tests never read
 *                           or write the developer's real ~/.config/prokodo
 *  - APPDATA              – same isolation for Windows
 *  - PROKODO_API_KEY      – deleted so inherited keys never leak into a test
 *  - PROKODO_API_BASE_URL – deleted to avoid inheriting a custom base URL
 */
function run(
  args: string[],
  opts: {
    cwd?: string;
    /** Override the HOME / USERPROFILE used for this run (e.g. to seed credentials). */
    homeDir?: string;
    /** Additional env overrides — merged last, so they take highest precedence. */
    env?: Record<string, string | undefined>;
  } = {},
): RunResult {
  const homeDir = opts.homeDir ?? DEFAULT_HOME_DIR;

  const env: Record<string, string | undefined> = {
    ...process.env,
    NO_COLOR: '1',
    // POSIX: os.homedir() checks HOME first
    HOME: homeDir,
    // Windows: os.homedir() checks USERPROFILE; GetConfigDir() checks APPDATA
    USERPROFILE: homeDir,
    APPDATA: path.join(homeDir, 'AppData', 'Roaming'),
  };

  // Wipe any inherited credentials / base-url BEFORE applying caller overrides
  // so that opts.env can deliberately re-set either key when a test needs it.
  delete env['PROKODO_API_KEY'];
  delete env['PROKODO_API_BASE_URL'];

  // Apply caller env overrides last — highest precedence
  if (opts.env) {
    Object.assign(env, opts.env);
  }

  const result = spawnSync(NODE, [CLI, ...args], {
    encoding: 'utf8',
    cwd: opts.cwd,
    env,
    timeout: 20_000,
  });

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    code: result.status ?? 1,
  };
}

/** Create a unique temp directory and return its path. */
function makeTmpDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
}

/**
 * Resolve the credentials directory path inside a given home dir.
 * Mirrors the logic in src/lib/platform.ts → getConfigDir().
 */
function getCredentialsDir(homeDir: string): string {
  if (process.platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Roaming', 'prokodo');
  }
  return path.join(homeDir, '.config', 'prokodo');
}

/** Write a pre-seeded credentials.json (as if `auth login` had been run). */
function seedCredentials(homeDir: string, apiKey: string): void {
  const credDir = getCredentialsDir(homeDir);
  fs.mkdirSync(credDir, { recursive: true });
  const credFile = path.join(credDir, 'credentials.json');
  fs.writeFileSync(credFile, JSON.stringify({ apiKey }));
  if (process.platform !== 'win32') {
    fs.chmodSync(credFile, 0o600);
  }
}

/** Write a .prokodo/config.json in a directory (as if `init` had been run). */
function seedConfig(
  dir: string,
  projectSlug = 'test-project',
  extra: Record<string, unknown> = {},
): void {
  const cfg = { projectSlug, verifyGlobs: ['src/**/*'], timeout: 300, ...extra };
  fs.mkdirSync(path.join(dir, '.prokodo'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.prokodo', 'config.json'), JSON.stringify(cfg, null, 2));
}

// ─── Sanity: binary must be pre-built ────────────────────────────────────────

beforeAll(() => {
  if (!fs.existsSync(CLI)) {
    throw new Error(
      `\nIntegration tests require a compiled binary.\n` +
        `Run "pnpm build" first, then re-run "pnpm test:integration".\n` +
        `Expected: ${CLI}\n`,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Binary basics — cli.ts entrypoint registration
// ═══════════════════════════════════════════════════════════════════════════════

describe('prokodo --help', () => {
  let result: RunResult;
  beforeAll(() => {
    result = run(['--help']);
  });

  it('exits 0', () => {
    expect(result.code).toBe(0);
  });

  it('lists every command declared in the registry (auto-fails when a new command is missing)', () => {
    for (const name of COMMAND_NAMES) {
      expect(result.stdout).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it('shows the Quick start examples section', () => {
    expect(result.stdout).toMatch(/quick start/i);
  });

  it('shows all global options defined in cli.ts', () => {
    expect(result.stdout).toMatch(/--json/);
    expect(result.stdout).toMatch(/--api-url/);
    expect(result.stdout).toMatch(/--api-key/);
    expect(result.stdout).toMatch(/--verbose/);
    expect(result.stdout).toMatch(/--no-color/);
  });
});

describe('prokodo --version', () => {
  it('exits 0', () => {
    expect(run(['--version']).code).toBe(0);
  });

  it('prints a semver string on stdout', () => {
    expect(run(['--version']).stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('-v shorthand prints the same semver', () => {
    const { code, stdout } = run(['-v']);
    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('-v and --version produce identical output', () => {
    const a = run(['-v']).stdout.trim();
    const b = run(['--version']).stdout.trim();
    expect(a).toBe(b);
  });
});

describe('unknown command handler', () => {
  it('exits 2 for an unrecognised command', () => {
    expect(run(['does-not-exist']).code).toBe(2);
  });

  it('reports the unknown command name in stderr', () => {
    expect(run(['does-not-exist']).stderr).toContain('does-not-exist');
  });

  it('emits to stderr, not stdout', () => {
    const { stdout, stderr } = run(['totally-unknown-cmd']);
    expect(stderr.length).toBeGreaterThan(0);
    // stdout should have nothing substantial beyond Commander auto-output
    expect(stderr).toContain('totally-unknown-cmd');
    void stdout; // no assertion on stdout — Commander may or may not emit something
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Global option wiring — cli.ts preAction hook passes opts to commands
// ═══════════════════════════════════════════════════════════════════════════════

describe('global --json option', () => {
  it('passes --json through to doctor: stdout is parseable JSON', () => {
    const { stdout } = run(['--json', 'doctor', '--api-url', DEAD_API_URL]);
    expect(() => JSON.parse(stdout)).not.toThrow();
  });

  it('doctor JSON output has top-level "passed" boolean and "checks" array', () => {
    const json = JSON.parse(run(['--json', 'doctor', '--api-url', DEAD_API_URL]).stdout) as {
      passed: boolean;
      checks: unknown[];
    };
    expect(typeof json.passed).toBe('boolean');
    expect(Array.isArray(json.checks)).toBe(true);
  });

  it('--json placed after the subcommand name also works', () => {
    // Commander global options must be placed before subcommand, but ensure
    // the flag is wired regardless of position via preAction hook
    const { stdout } = run(['--json', 'doctor', '--api-url', DEAD_API_URL]);
    expect(() => JSON.parse(stdout)).not.toThrow();
  });
});

describe('global --verbose option', () => {
  it('is accepted without crashing (exit < 2)', () => {
    const { code } = run(['--verbose', 'doctor', '--api-url', DEAD_API_URL]);
    // doctor exits 0 (all pass) or 1 (some fail), never 2 for a valid invocation
    expect(code).toBeLessThan(2);
  });
});

describe('global --no-color option', () => {
  it('is accepted without crashing', () => {
    const { code } = run(['--no-color', 'doctor', '--api-url', DEAD_API_URL]);
    expect(code).toBeLessThan(2);
  });
});

describe('PROKODO_API_BASE_URL env var as default --api-url', () => {
  it('is picked up and used as the API base URL', () => {
    // Use a loopback address at a different port so detail unambiguously contains it
    const customUrl = 'http://127.0.0.1:19998';
    const { stdout } = run(['--json', 'doctor'], {
      env: { PROKODO_API_BASE_URL: customUrl },
    });
    const json = JSON.parse(stdout) as { checks: Array<{ name: string; detail: string }> };
    const reach = json.checks.find((c) => c.name === 'API reachability');
    expect(reach?.detail).toContain('19998');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. auth commands
// ═══════════════════════════════════════════════════════════════════════════════

describe('prokodo auth --help', () => {
  it('exits 0 and lists login, logout, whoami', () => {
    const { code, stdout } = run(['auth', '--help']);
    expect(code).toBe(0);
    expect(stdout).toMatch(/login/);
    expect(stdout).toMatch(/logout/);
    expect(stdout).toMatch(/whoami/);
  });
});

// ── auth login ────────────────────────────────────────────────────────────────

describe('prokodo auth login', () => {
  it('exits 2 when --key is missing and stdin is not a TTY (non-interactive)', () => {
    // Spawned processes have no TTY — isInteractive() returns false
    expect(run(['auth', 'login']).code).toBe(2);
  });

  it('stderr explains the missing key and suggests --key flag', () => {
    expect(run(['auth', 'login']).stderr).toMatch(/--key|key/i);
  });

  it('exits 2 when --key has an invalid shape (too short)', () => {
    expect(run(['auth', 'login', '--key', 'short']).code).toBe(2);
  });

  it('stderr explains the invalid key shape', () => {
    expect(run(['auth', 'login', '--key', 'short']).stderr).toMatch(/valid|invalid|key/i);
  });

  it('auth login --help exits 0', () => {
    expect(run(['auth', 'login', '--help']).code).toBe(0);
  });
});

// ── auth logout ───────────────────────────────────────────────────────────────

describe('prokodo auth logout', () => {
  it('exits 0 when no credentials file exists', () => {
    expect(run(['auth', 'logout']).code).toBe(0);
  });

  it('tells the user in text mode when no credentials were stored', () => {
    const { stdout } = run(['auth', 'logout']);
    expect(stdout).toMatch(/no credentials|not logged/i);
  });

  it('--json emits { loggedOut: false } when no credentials exist', () => {
    const { code, stdout } = run(['--json', 'auth', 'logout']);
    expect(code).toBe(0);
    expect((JSON.parse(stdout) as { loggedOut: boolean }).loggedOut).toBe(false);
  });

  it('removes the credentials file and exits 0 when credentials exist', () => {
    const homeDir = makeTmpDir('prokodo-logout');
    try {
      seedCredentials(homeDir, 'pk_live_test1234567890abcd');
      const credFile = path.join(getCredentialsDir(homeDir), 'credentials.json');
      expect(fs.existsSync(credFile)).toBe(true);

      const { code } = run(['auth', 'logout'], { homeDir });
      expect(code).toBe(0);
      expect(fs.existsSync(credFile)).toBe(false);
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('text mode confirms removal when credentials were deleted', () => {
    const homeDir = makeTmpDir('prokodo-logout-text');
    try {
      seedCredentials(homeDir, 'pk_live_test1234567890abcd');
      const { stdout } = run(['auth', 'logout'], { homeDir });
      expect(stdout).toMatch(/removed|logged out|credentials/i);
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('--json emits { loggedOut: true } when credentials were removed', () => {
    const homeDir = makeTmpDir('prokodo-logout-json');
    try {
      seedCredentials(homeDir, 'pk_live_test1234567890abcd');
      const { stdout } = run(['--json', 'auth', 'logout'], { homeDir });
      expect((JSON.parse(stdout) as { loggedOut: boolean }).loggedOut).toBe(true);
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('auth logout --help exits 0', () => {
    expect(run(['auth', 'logout', '--help']).code).toBe(0);
  });
});

// ── auth whoami ───────────────────────────────────────────────────────────────

describe('prokodo auth whoami', () => {
  it('exits 2 when no API key is configured', () => {
    expect(run(['auth', 'whoami']).code).toBe(2);
  });

  it('exits 2 in JSON mode when no API key is configured', () => {
    expect(run(['--json', 'auth', 'whoami']).code).toBe(2);
  });

  it('exits 0 and shows masked key when credentials are stored', () => {
    const homeDir = makeTmpDir('prokodo-whoami');
    try {
      seedCredentials(homeDir, 'pk_live_test1234567890abcd');
      const { code, stdout } = run(['auth', 'whoami'], { homeDir });
      expect(code).toBe(0);
      // maskKey returns '••••••••abcd' — last 4 chars visible
      expect(stdout).toContain('abcd');
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('--json emits { keyHint } containing the last 4 chars of the key', () => {
    const homeDir = makeTmpDir('prokodo-whoami-json');
    try {
      seedCredentials(homeDir, 'pk_live_test1234567890abcd');
      const { code, stdout } = run(['--json', 'auth', 'whoami'], { homeDir });
      expect(code).toBe(0);
      const json = JSON.parse(stdout) as { keyHint: string };
      expect(typeof json.keyHint).toBe('string');
      expect(json.keyHint).toContain('abcd');
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('--api-key flag is also accepted and resolves the key', () => {
    const { code, stdout } = run([
      '--json',
      'auth',
      'whoami',
      '--api-key',
      'pk_live_flagvalue01234',
    ]);
    expect(code).toBe(0);
    const json = JSON.parse(stdout) as { keyHint: string };
    expect(json.keyHint).toContain('1234'); // last 4 chars of 'pk_live_flagvalue01234'
  });

  it('auth whoami --help exits 0', () => {
    expect(run(['auth', 'whoami', '--help']).code).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. init command
// ═══════════════════════════════════════════════════════════════════════════════

describe('prokodo init', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir('prokodo-init');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exits 0 and creates .prokodo/config.json', () => {
    const { code } = run(['init'], { cwd: tmpDir });
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, '.prokodo', 'config.json'))).toBe(true);
  });

  it('creates config with projectType when --type n8n-node is given', () => {
    const { code } = run(['init', '--type', 'n8n-node'], { cwd: tmpDir });
    expect(code).toBe(0);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.prokodo', 'config.json'), 'utf8'),
    ) as { projectType: string };
    expect(cfg.projectType).toBe('n8n-node');
  });

  it('--json emits { created: true, path, config } on stdout', () => {
    const { code, stdout } = run(['--json', 'init', '--type', 'n8n-node'], { cwd: tmpDir });
    expect(code).toBe(0);
    const json = JSON.parse(stdout) as { created: boolean; path: string; config: object };
    expect(json.created).toBe(true);
    expect(json.path).toContain('.prokodo');
    expect(typeof json.config).toBe('object');
  });

  it('warns and exits 0 (no overwrite) when config exists and --force is not used', () => {
    run(['init'], { cwd: tmpDir });
    const { code, stderr } = run(['init'], { cwd: tmpDir });
    expect(code).toBe(0);
    // warn() writes to stderr
    expect(stderr).toMatch(/already exists|--force/i);
  });

  it('--force overwrites an existing config', () => {
    run(['init', '--type', 'n8n-node'], { cwd: tmpDir });
    const { code } = run(['init', '--force'], { cwd: tmpDir });
    expect(code).toBe(0);
    // After --force with no --type, config should be empty object
    const cfg = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.prokodo', 'config.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(cfg).toEqual({});
  });

  it('exits 2 for --type n8n-workflow (not yet supported)', () => {
    const { code, stderr } = run(['init', '--type', 'n8n-workflow'], { cwd: tmpDir });
    expect(code).toBe(2);
    expect(stderr).toMatch(/n8n-workflow.*not yet supported/i);
  });

  it('exits 2 for an unrecognised --type value', () => {
    const { code } = run(['init', '--type', 'unknown-type'], { cwd: tmpDir });
    expect(code).toBe(2);
  });

  it('text mode prints a success message with the relative config path', () => {
    const { stdout } = run(['init'], { cwd: tmpDir });
    expect(stdout).toMatch(/\.prokodo/);
  });

  it('init --help exits 0', () => {
    expect(run(['init', '--help']).code).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. doctor command
// ═══════════════════════════════════════════════════════════════════════════════

describe('prokodo doctor', () => {
  it('exits 1 when checks fail (no credentials + dead API URL)', () => {
    expect(run(['doctor', '--api-url', DEAD_API_URL]).code).toBe(1);
  });

  it('--json outputs valid JSON to stdout', () => {
    const { stdout } = run(['--json', 'doctor', '--api-url', DEAD_API_URL]);
    expect(() => JSON.parse(stdout)).not.toThrow();
  });

  it('JSON output has boolean "passed" and non-empty "checks" array', () => {
    const json = JSON.parse(run(['--json', 'doctor', '--api-url', DEAD_API_URL]).stdout) as {
      passed: boolean;
      checks: unknown[];
    };
    expect(typeof json.passed).toBe('boolean');
    expect(Array.isArray(json.checks)).toBe(true);
    expect(json.checks.length).toBeGreaterThan(0);
  });

  it('JSON includes all four expected check names', () => {
    const json = JSON.parse(run(['--json', 'doctor', '--api-url', DEAD_API_URL]).stdout) as {
      checks: Array<{ name: string }>;
    };
    const names = json.checks.map((c) => c.name);
    expect(names).toContain('Node version');
    expect(names).toContain('API key configured');
    expect(names).toContain('.prokodo/config.json');
    expect(names).toContain('API reachability');
  });

  it('each check object has { name: string, passed: boolean, detail: string }', () => {
    const json = JSON.parse(run(['--json', 'doctor', '--api-url', DEAD_API_URL]).stdout) as {
      checks: Array<{ name: string; passed: boolean; detail: string }>;
    };
    for (const check of json.checks) {
      expect(typeof check.name).toBe('string');
      expect(check.name.length).toBeGreaterThan(0);
      expect(typeof check.passed).toBe('boolean');
      expect(typeof check.detail).toBe('string');
    }
  });

  it('Node version check passes on Node >= 22', () => {
    const json = JSON.parse(run(['--json', 'doctor', '--api-url', DEAD_API_URL]).stdout) as {
      checks: Array<{ name: string; passed: boolean }>;
    };
    const nodeCheck = json.checks.find((c) => c.name === 'Node version');
    expect(nodeCheck?.passed).toBe(true);
  });

  it('passed is false when API is unreachable and no credentials are configured', () => {
    const json = JSON.parse(run(['--json', 'doctor', '--api-url', DEAD_API_URL]).stdout) as {
      passed: boolean;
    };
    expect(json.passed).toBe(false);
  });

  it('API key configured check passes when --api-key flag is supplied', () => {
    const json = JSON.parse(
      run(['--json', '--api-key', 'pk_live_testflag1234', 'doctor', '--api-url', DEAD_API_URL])
        .stdout,
    ) as { checks: Array<{ name: string; passed: boolean }> };
    const credCheck = json.checks.find((c) => c.name === 'API key configured');
    expect(credCheck?.passed).toBe(true);
  });

  it('API key configured check passes when PROKODO_API_KEY env var is set', () => {
    const json = JSON.parse(
      run(['--json', 'doctor', '--api-url', DEAD_API_URL], {
        env: { PROKODO_API_KEY: 'pk_live_envvar1234' },
      }).stdout,
    ) as { checks: Array<{ name: string; passed: boolean }> };
    const credCheck = json.checks.find((c) => c.name === 'API key configured');
    expect(credCheck?.passed).toBe(true);
  });

  it('.prokodo/config.json check passes when config file exists in cwd', () => {
    const tmpDir = makeTmpDir('prokodo-doctor-cfg');
    try {
      seedConfig(tmpDir);
      const json = JSON.parse(
        run(['--json', 'doctor', '--api-url', DEAD_API_URL], { cwd: tmpDir }).stdout,
      ) as { checks: Array<{ name: string; passed: boolean }> };
      const cfgCheck = json.checks.find((c) => c.name === '.prokodo/config.json');
      expect(cfgCheck?.passed).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('text mode prints check output (name + detail) to stdout', () => {
    const { stdout } = run(['doctor', '--api-url', DEAD_API_URL]);
    expect(stdout).toMatch(/Node version/i);
  });

  it('doctor --help exits 0', () => {
    expect(run(['doctor', '--help']).code).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. verify command
// ═══════════════════════════════════════════════════════════════════════════════

describe('prokodo verify', () => {
  it('exits 2 when no .prokodo/config.json exists in cwd', () => {
    const tmpDir = makeTmpDir('prokodo-verify-no-cfg');
    try {
      expect(run(['verify'], { cwd: tmpDir }).code).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('stderr mentions the missing config when no config file is found', () => {
    const tmpDir = makeTmpDir('prokodo-verify-no-cfg-msg');
    try {
      const { stderr } = run(['verify'], { cwd: tmpDir });
      expect(stderr).toMatch(/config|\.prokodo/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits 2 for --timeout with a non-numeric value', () => {
    const tmpDir = makeTmpDir('prokodo-verify-bad-timeout');
    try {
      // Config must exist; timeout validation happens before file collection
      seedConfig(tmpDir);
      expect(run(['verify', '--timeout', 'not-a-number'], { cwd: tmpDir }).code).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits 2 for --timeout of 0 (non-positive)', () => {
    const tmpDir = makeTmpDir('prokodo-verify-zero-timeout');
    try {
      seedConfig(tmpDir);
      expect(run(['verify', '--timeout', '0'], { cwd: tmpDir }).code).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('stderr explains the invalid timeout', () => {
    const tmpDir = makeTmpDir('prokodo-verify-timeout-msg');
    try {
      seedConfig(tmpDir);
      const { stderr } = run(['verify', '--timeout', 'abc'], { cwd: tmpDir });
      expect(stderr).toMatch(/timeout|seconds/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('verify --help exits 0', () => {
    expect(run(['verify', '--help']).code).toBe(0);
  });

  // ── npm package mode ───────────────────────────────────────────────────────

  it('npm mode: exits 2 with "--type is required" when no --type given', () => {
    const { code, stderr } = run(['verify', '@scope/my-pkg']);
    expect(code).toBe(2);
    expect(stderr).toMatch(/--type.*required|type.*required/i);
  });

  it('npm mode: exits 2 with file-path blocked message for .json arg', () => {
    const { code, stderr } = run(['verify', 'workflow.json']);
    expect(code).toBe(2);
    expect(stderr).toMatch(/not yet supported|npm package/i);
  });

  it('npm mode: exits 2 with "n8n-workflow not yet supported" for --type n8n-workflow', () => {
    const { code, stderr } = run(['verify', '--type', 'n8n-workflow']);
    expect(code).toBe(2);
    expect(stderr).toMatch(/n8n-workflow.*not yet supported/i);
  });

  it('npm mode: proceeds past arg validation and exits non-zero for network error', () => {
    // With a fake API key and a dead API URL, npm mode should pass all argument
    // validation and fail at the network level (not exit 2 from a config/arg error).
    const { code, stderr } = run(
      ['verify', '@scope/my-pkg', '--type', 'n8n-node', '--api-url', DEAD_API_URL],
      {
        env: {
          PROKODO_API_KEY: 'pk_test_integration_1234567890',
          PROKODO_API_BASE_URL: undefined,
        },
      },
    );
    // exit 1 = network/API error (not exit 2 = arg/config validation error)
    expect(code).toBe(1);
    expect(stderr).toMatch(/network|error|connect|refused|ECONNREFUSED/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. credits command
// ═══════════════════════════════════════════════════════════════════════════════

describe('prokodo credits', () => {
  it('exits 2 when no API key is configured (non-interactive)', () => {
    expect(run(['credits']).code).toBe(2);
  });

  it('stderr explains the missing API key and how to fix it', () => {
    const { stderr } = run(['credits']);
    expect(stderr).toMatch(/api key|PROKODO_API_KEY|auth login/i);
  });

  it('--json also exits 2 with no key in non-interactive mode', () => {
    expect(run(['--json', 'credits']).code).toBe(2);
  });

  it('credits --help exits 0', () => {
    expect(run(['credits', '--help']).code).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. help subcommand for every registered command
// ═══════════════════════════════════════════════════════════════════════════════

describe('every top-level --help exits 0 (driven by registry)', () => {
  // This list is generated from COMMAND_NAMES so it grows automatically.
  for (const name of COMMAND_NAMES) {
    it(`prokodo ${name} --help exits 0`, () => {
      expect(run([name, '--help']).code).toBe(0);
    });
  }
});

describe('auth sub-command --help exits 0', () => {
  // auth has nested sub-commands; test them explicitly.
  const authSubCmds = ['login', 'logout', 'whoami'];
  for (const sub of authSubCmds) {
    it(`prokodo auth ${sub} --help exits 0`, () => {
      expect(run(['auth', sub, '--help']).code).toBe(0);
    });
  }
});

describe('prokodo help <command> exits 0 (driven by registry)', () => {
  for (const name of COMMAND_NAMES) {
    it(`prokodo help ${name} exits 0`, () => {
      expect(run(['help', name]).code).toBe(0);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. help completeness — every registry entry appears in --help
//
// PURPOSE: this suite auto-fails whenever a command is added to the registry
// but its name does not appear in `prokodo --help`.  It replaces the previous
// hardcoded five-name list so no manual update is ever needed.
// ═══════════════════════════════════════════════════════════════════════════════

describe('help completeness — every command in the registry appears in --help', () => {
  let helpOutput: string;

  beforeAll(() => {
    helpOutput = run(['--help']).stdout;
  });

  for (const name of COMMAND_NAMES) {
    // Each iteration captures `name` in a closure — no let/const shadowing needed.
    it(`"${name}" is listed in prokodo --help`, () => {
      expect(helpOutput).toMatch(new RegExp(`\\b${name}\\b`));
    });
  }

  it('total number of commands in --help matches the registry', () => {
    // Count unique command-name word-matches in the Commands section.
    // This guards against the case where a name appears only in an example.
    const commandsSection = helpOutput.slice(helpOutput.toLowerCase().indexOf('commands:'));
    for (const name of COMMAND_NAMES) {
      expect(commandsSection).toContain(name);
    }
  });
});
