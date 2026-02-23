import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateConfig, saveConfig, loadConfig, configPath } from './config';

// ─── validateConfig ───────────────────────────────────────────────────────────

describe('validateConfig', () => {
  it('returns empty config for empty object', () => {
    const cfg = validateConfig({});
    expect(cfg).toEqual({});
  });

  it('accepts valid projectType n8n-node', () => {
    const cfg = validateConfig({ projectType: 'n8n-node' });
    expect(cfg.projectType).toBe('n8n-node');
  });

  // TODO: re-enable once n8n-workflow verification is implemented
  it.skip('accepts valid projectType n8n-workflow', () => {
    const cfg = validateConfig({ projectType: 'n8n-workflow' });
    expect(cfg.projectType).toBe('n8n-workflow');
  });

  it('throws on invalid projectType', () => {
    expect(() => validateConfig({ projectType: 'unknown' })).toThrow(/projectType/);
  });

  it('accepts valid include array', () => {
    const cfg = validateConfig({ include: ['src', 'package.json'] });
    expect(cfg.include).toEqual(['src', 'package.json']);
  });

  it('throws when include is not an array', () => {
    expect(() => validateConfig({ include: 'src/**' })).toThrow(/include/);
  });

  it('throws when include contains non-strings', () => {
    expect(() => validateConfig({ include: [1, 2] })).toThrow(/include/);
  });

  it('accepts valid timeout', () => {
    const cfg = validateConfig({ timeout: 120 });
    expect(cfg.timeout).toBe(120);
  });

  it('throws on zero timeout', () => {
    expect(() => validateConfig({ timeout: 0 })).toThrow(/timeout/);
  });

  it('throws on negative timeout', () => {
    expect(() => validateConfig({ timeout: -5 })).toThrow(/timeout/);
  });

  it('throws on non-number timeout', () => {
    expect(() => validateConfig({ timeout: '300' })).toThrow(/timeout/);
  });

  it('rejects Infinity timeout', () => {
    expect(() => validateConfig({ timeout: Infinity })).toThrow(/timeout/);
  });

  it('rejects NaN timeout', () => {
    expect(() => validateConfig({ timeout: NaN })).toThrow(/timeout/);
  });

  it('throws on non-object input', () => {
    expect(() => validateConfig(null)).toThrow(/expected a JSON object/i);
    expect(() => validateConfig([])).toThrow(/expected a JSON object/i);
    expect(() => validateConfig('string')).toThrow(/expected a JSON object/i);
  });

  it('accepts a full valid config', () => {
    const cfg = validateConfig({
      projectType: 'n8n-node',
      include: ['src', 'package.json'],
      timeout: 60,
    });
    expect(cfg.projectType).toBe('n8n-node');
    expect(cfg.include).toEqual(['src', 'package.json']);
    expect(cfg.timeout).toBe(60);
  });
});

// ─── loadConfig ───────────────────────────────────────────────────────────────

describe('loadConfig', () => {
  it('returns empty config when file does not exist', () => {
    const nonexistent = path.join(os.tmpdir(), 'prokodo-no-config-' + Date.now());
    const cfg = loadConfig(nonexistent);
    expect(cfg).toEqual({});
  });

  it('throws on invalid JSON in config file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-badjson-'));
    fs.mkdirSync(path.join(tmpDir, '.prokodo'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.prokodo', 'config.json'), '{ not valid json');

    expect(() => loadConfig(tmpDir)).toThrow(/Failed to parse/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── saveConfig + loadConfig round-trip ──────────────────────────────────────

describe('saveConfig + loadConfig', () => {
  it('full round-trip preserves all fields', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-roundtrip-'));
    const config = {
      projectType: 'n8n-node' as const,
      include: ['src', 'package.json'],
      timeout: 90,
    };
    saveConfig(config, tmpDir);
    const loaded = loadConfig(tmpDir);

    expect(loaded.projectType).toBe('n8n-node');
    expect(loaded.include).toEqual(['src', 'package.json']);
    expect(loaded.timeout).toBe(90);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips an empty config', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-empty-'));
    saveConfig({}, tmpDir);
    const loaded = loadConfig(tmpDir);
    expect(loaded).toEqual({});
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('overwriting config replaces all fields', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-overwrite-'));

    saveConfig({ projectType: 'n8n-node', timeout: 60 }, tmpDir);
    saveConfig({ projectType: 'n8n-workflow', timeout: 120 }, tmpDir);

    const loaded = loadConfig(tmpDir);
    expect(loaded.projectType).toBe('n8n-workflow');
    expect(loaded.timeout).toBe(120);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ─── default parameter branches ───────────────────────────────────────────────

describe('default parameter branches', () => {
  it('configPath() uses process.cwd() when no basePath given', () => {
    const result = configPath();
    expect(result).toContain(process.cwd());
    expect(result).toContain('config.json');
  });

  it('saveConfig() uses process.cwd() when no basePath given', () => {
    const savedCwd = process.cwd();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-cwd-save-'));
    process.chdir(tmpDir);
    try {
      saveConfig({ projectType: 'n8n-node' });
      expect(fs.existsSync(path.join(tmpDir, '.prokodo', 'config.json'))).toBe(true);
    } finally {
      process.chdir(savedCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('loadConfig() uses process.cwd() when no basePath given', () => {
    const savedCwd = process.cwd();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-cwd-load-'));
    saveConfig({ projectType: 'n8n-workflow' }, tmpDir);
    process.chdir(tmpDir);
    try {
      const cfg = loadConfig();
      expect(cfg.projectType).toBe('n8n-workflow');
    } finally {
      process.chdir(savedCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
