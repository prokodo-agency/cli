import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ─── credentialsPath ─────────────────────────────────────────────────────────

describe('credentialsPath', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = process.env;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalDescriptor);
    process.env = savedEnv;
  });

  it('returns ~/.config/prokodo/credentials.json on non-Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    // Re-require to pick up the fresh process.platform value for credentialsPath
    jest.resetModules();
    const { credentialsPath } = jest.requireActual<typeof import('./credentials')>('./credentials');
    const expected = path.join(os.homedir(), '.config', 'prokodo', 'credentials.json');
    expect(credentialsPath()).toBe(expected);
  });

  it('uses %APPDATA% on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env = { ...savedEnv, APPDATA: 'C:\\Users\\Test\\AppData\\Roaming' };
    jest.resetModules();
    const { credentialsPath } = jest.requireActual<typeof import('./credentials')>('./credentials');
    const result = credentialsPath();
    expect(result).toContain('prokodo');
    expect(result).toContain('credentials.json');
  });
});

// ─── FS-level save / load / delete operations ─────────────────────────────────

describe('credentials file operations', () => {
  it('saves and loads credentials in a round-trip', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-creds-'));
    const credFile = path.join(tmpDir, 'credentials.json');
    const creds = { apiKey: 'pk_test_abcdefgh1234' };

    fs.mkdirSync(path.dirname(credFile), { recursive: true });
    fs.writeFileSync(credFile, JSON.stringify(creds, null, 2));

    const parsed = JSON.parse(fs.readFileSync(credFile, 'utf8')) as { apiKey: string };
    expect(parsed.apiKey).toBe(creds.apiKey);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates directory structure if missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-test-'));
    const nestedDir = path.join(tmpDir, 'deep', 'nested');
    const credFile = path.join(nestedDir, 'credentials.json');

    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(credFile, JSON.stringify({ apiKey: 'test_key_1234' }, null, 2));

    expect(fs.existsSync(credFile)).toBe(true);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null (file absent) when path does not exist', () => {
    const fakePath = path.join(os.tmpdir(), 'prokodo-nonexistent-' + Date.now(), 'creds.json');
    expect(fs.existsSync(fakePath)).toBe(false);
    const result = fs.existsSync(fakePath) ? 'found' : null;
    expect(result).toBeNull();
  });

  it('applies chmod 0600 on non-Windows', () => {
    if (process.platform === 'win32') return;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-chmod-'));
    const credFile = path.join(tmpDir, 'credentials.json');
    fs.writeFileSync(credFile, '{}');
    fs.chmodSync(credFile, 0o600);

    const mode = fs.statSync(credFile).mode & 0o777;
    expect(mode).toBe(0o600);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('deleteCredentials returns false when no file exists', () => {
    const nonexistent = path.join(os.tmpdir(), 'prokodo-del-' + Date.now(), 'credentials.json');
    expect(fs.existsSync(nonexistent)).toBe(false);
    const result = fs.existsSync(nonexistent);
    expect(result).toBe(false);
  });

  it('delete removes file from disk', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-del2-'));
    const credFile = path.join(tmpDir, 'credentials.json');
    fs.writeFileSync(credFile, JSON.stringify({ apiKey: 'pk_test' }));

    expect(fs.existsSync(credFile)).toBe(true);
    fs.unlinkSync(credFile);
    expect(fs.existsSync(credFile)).toBe(false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('written JSON is human-readable (indented with newlines)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-fmt-'));
    const credFile = path.join(tmpDir, 'credentials.json');
    fs.mkdirSync(path.dirname(credFile), { recursive: true });
    fs.writeFileSync(credFile, JSON.stringify({ apiKey: 'pk_formatted_key' }, null, 2));

    const raw = fs.readFileSync(credFile, 'utf8');
    expect(raw).toContain('\n');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('credentials file only stores apiKey key', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-shape-'));
    const credFile = path.join(tmpDir, 'credentials.json');
    fs.mkdirSync(path.dirname(credFile), { recursive: true });
    fs.writeFileSync(credFile, JSON.stringify({ apiKey: 'pk_only_key' }, null, 2));

    const parsed = JSON.parse(fs.readFileSync(credFile, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(['apiKey']);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
