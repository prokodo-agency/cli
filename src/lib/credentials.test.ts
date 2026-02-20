import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// We need to control getConfigDir() to point at a temp directory.
// jest.mock is hoisted, so we use a variable that the factory closes over.
let mockConfigDir = '/tmp/prokodo-creds-default';

jest.mock('./platform', () => ({
  getConfigDir: () => mockConfigDir,
  isInteractive: jest.fn(() => false),
  getDefaultApiUrl: jest.fn(() => 'https://test.invalid'),
}));

import {
  credentialsPath,
  loadCredentials,
  saveCredentials,
  deleteCredentials,
} from './credentials';

// ─── credentialsPath ─────────────────────────────────────────────────────────

describe('credentialsPath', () => {
  it('returns a path inside getConfigDir()', () => {
    mockConfigDir = '/tmp/prokodo-creds-test';
    jest.resetModules(); // force re-evaluation of credentialsPath on next import
    // credentialsPath() reads mockConfigDir at call-time via the mocked getConfigDir
    const p = credentialsPath();
    expect(p).toContain('prokodo-creds-test');
    expect(p).toContain('credentials.json');
  });

  it('ends with credentials.json', () => {
    const p = credentialsPath();
    expect(path.basename(p)).toBe('credentials.json');
  });
});

// ─── saveCredentials + loadCredentials round-trip ────────────────────────────

describe('saveCredentials + loadCredentials', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-creds-'));
    mockConfigDir = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saves and loads credentials round-trip', () => {
    saveCredentials({ apiKey: 'pk_test_abcdefgh1234' });
    const loaded = loadCredentials();
    expect(loaded).not.toBeNull();
    expect(loaded!.apiKey).toBe('pk_test_abcdefgh1234');
  });

  it('creates parent directory if it does not exist', () => {
    const nested = path.join(tmpDir, 'new-dir');
    mockConfigDir = nested;
    expect(fs.existsSync(nested)).toBe(false);
    saveCredentials({ apiKey: 'pk_test_mkdir_12345678' });
    expect(fs.existsSync(path.join(nested, 'credentials.json'))).toBe(true);
  });

  it('writes human-readable indented JSON', () => {
    saveCredentials({ apiKey: 'pk_formatted_key_1234' });
    const raw = fs.readFileSync(credentialsPath(), 'utf8');
    expect(raw).toContain('\n');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('overwriting saves the new key', () => {
    saveCredentials({ apiKey: 'pk_first_12345678' });
    saveCredentials({ apiKey: 'pk_second_87654321' });
    const loaded = loadCredentials();
    expect(loaded!.apiKey).toBe('pk_second_87654321');
  });

  it('loadCredentials returns null when file does not exist', () => {
    const result = loadCredentials();
    expect(result).toBeNull();
  });

  it('loadCredentials returns null when file contains invalid JSON', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(credentialsPath(), 'NOT JSON');
    const result = loadCredentials();
    expect(result).toBeNull();
  });

  it('applies chmod 0600 on non-Windows', () => {
    if (process.platform === 'win32') return;
    saveCredentials({ apiKey: 'pk_chmod_test_1234' });
    const mode = fs.statSync(credentialsPath()).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

// ─── loadCredentials — permission warning ────────────────────────────────────

describe('loadCredentials permission warning', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-creds-perm-'));
    mockConfigDir = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes a warning to stderr when permissions are > 0600 (non-win32)', () => {
    if (process.platform === 'win32') return;

    saveCredentials({ apiKey: 'pk_loose_perms_1234' });
    fs.chmodSync(credentialsPath(), 0o644); // loosen permissions

    const stderrChunks: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as { write: unknown }).write = (chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    };

    try {
      loadCredentials();
    } finally {
      process.stderr.write = originalWrite;
    }

    expect(stderrChunks.join('')).toContain('Warning');
  });

  it('does not warn when file permissions are exactly 0600', () => {
    if (process.platform === 'win32') return;

    saveCredentials({ apiKey: 'pk_good_perms_12345' });
    // saveCredentials already chmods to 0600

    const stderrChunks: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as { write: unknown }).write = (chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    };

    try {
      loadCredentials();
    } finally {
      process.stderr.write = originalWrite;
    }

    expect(stderrChunks.join('')).not.toContain('Warning');
  });
});

// ─── deleteCredentials ────────────────────────────────────────────────────────

describe('deleteCredentials', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-del-'));
    mockConfigDir = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns false when credentials file does not exist', () => {
    expect(deleteCredentials()).toBe(false);
  });

  it('returns true and removes the file when it exists', () => {
    saveCredentials({ apiKey: 'pk_to_delete_1234' });
    expect(fs.existsSync(credentialsPath())).toBe(true);

    const result = deleteCredentials();
    expect(result).toBe(true);
    expect(fs.existsSync(credentialsPath())).toBe(false);
  });

  it('second delete after first returns false', () => {
    saveCredentials({ apiKey: 'pk_double_delete_12' });
    deleteCredentials();
    expect(deleteCredentials()).toBe(false);
  });
});
