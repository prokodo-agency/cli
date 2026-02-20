import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateConfig, buildDefaultConfig, saveConfig, loadConfig } from './config';

// ─── validateConfig ───────────────────────────────────────────────────────────

describe('validateConfig', () => {
  it('accepts a valid config', () => {
    const cfg = validateConfig({
      projectSlug: 'my-project',
      verifyGlobs: ['src/**/*'],
      timeout: 120,
    });
    expect(cfg.projectSlug).toBe('my-project');
    expect(cfg.verifyGlobs).toEqual(['src/**/*']);
    expect(cfg.timeout).toBe(120);
  });

  it('trims projectSlug whitespace', () => {
    const cfg = validateConfig({ projectSlug: '  hello  ', verifyGlobs: ['src/**'], timeout: 60 });
    expect(cfg.projectSlug).toBe('hello');
  });

  it('throws on non-object input', () => {
    expect(() => validateConfig(null)).toThrow(/expected a JSON object/i);
    expect(() => validateConfig([])).toThrow(/expected a JSON object/i);
    expect(() => validateConfig('string')).toThrow(/expected a JSON object/i);
  });

  it('throws on empty projectSlug', () => {
    expect(() => validateConfig({ projectSlug: '', verifyGlobs: ['src/**'], timeout: 60 })).toThrow(
      /projectSlug/,
    );
  });

  it('throws on missing projectSlug', () => {
    expect(() => validateConfig({ verifyGlobs: ['src/**'], timeout: 60 })).toThrow(/projectSlug/);
  });

  it('throws on non-array verifyGlobs', () => {
    expect(() => validateConfig({ projectSlug: 'x', verifyGlobs: 'src/**', timeout: 60 })).toThrow(
      /verifyGlobs/,
    );
  });

  it('throws on verifyGlobs containing non-strings', () => {
    expect(() => validateConfig({ projectSlug: 'x', verifyGlobs: [1, 2], timeout: 60 })).toThrow(
      /verifyGlobs/,
    );
  });

  it('throws on zero timeout', () => {
    expect(() => validateConfig({ projectSlug: 'x', verifyGlobs: ['src/**'], timeout: 0 })).toThrow(
      /timeout/,
    );
  });

  it('throws on negative timeout', () => {
    expect(() =>
      validateConfig({ projectSlug: 'x', verifyGlobs: ['src/**'], timeout: -5 }),
    ).toThrow(/timeout/);
  });

  it('throws on non-number timeout', () => {
    expect(() =>
      validateConfig({ projectSlug: 'x', verifyGlobs: ['src/**'], timeout: '300' }),
    ).toThrow(/timeout/);
  });

  it('accepts empty verifyGlobs array', () => {
    const cfg = validateConfig({ projectSlug: 'test', verifyGlobs: [], timeout: 60 });
    expect(cfg.verifyGlobs).toEqual([]);
  });

  it('accepts multiple globs including exclusion patterns', () => {
    const globs = ['src/**/*', '!node_modules/**', 'lib/**/*.ts'];
    const cfg = validateConfig({ projectSlug: 'x', verifyGlobs: globs, timeout: 30 });
    expect(cfg.verifyGlobs).toEqual(globs);
  });

  it('rejects Infinity timeout', () => {
    expect(() =>
      validateConfig({ projectSlug: 'x', verifyGlobs: ['src/**'], timeout: Infinity }),
    ).toThrow(/timeout/);
  });

  it('rejects NaN timeout', () => {
    expect(() =>
      validateConfig({ projectSlug: 'x', verifyGlobs: ['src/**'], timeout: NaN }),
    ).toThrow(/timeout/);
  });

  it('rejects whitespace-only projectSlug', () => {
    expect(() =>
      validateConfig({ projectSlug: '   ', verifyGlobs: ['src/**'], timeout: 60 }),
    ).toThrow(/projectSlug/);
  });
});

// ─── buildDefaultConfig ───────────────────────────────────────────────────────

describe('buildDefaultConfig', () => {
  it('fills sensible defaults', () => {
    const cfg = buildDefaultConfig({ projectSlug: 'test-slug' });
    expect(cfg.projectSlug).toBe('test-slug');
    expect(cfg.verifyGlobs.length).toBeGreaterThan(0);
    expect(cfg.timeout).toBeGreaterThan(0);
  });

  it('overrides are respected', () => {
    const cfg = buildDefaultConfig({ projectSlug: 'p', timeout: 999 });
    expect(cfg.timeout).toBe(999);
  });

  it('default timeout is 300', () => {
    const cfg = buildDefaultConfig({ projectSlug: 'p' });
    expect(cfg.timeout).toBe(300);
  });
});

// ─── loadConfig ───────────────────────────────────────────────────────────────

describe('loadConfig', () => {
  it('throws descriptive error when file does not exist', () => {
    const nonexistent = path.join(os.tmpdir(), 'prokodo-no-config-' + Date.now());
    expect(() => loadConfig(nonexistent)).toThrow(/prokodo init/);
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
    const config = buildDefaultConfig({
      projectSlug: 'round-trip-project',
      timeout: 90,
      verifyGlobs: ['src/**', '!dist/**'],
    });
    saveConfig(config, tmpDir);
    const loaded = loadConfig(tmpDir);

    expect(loaded.projectSlug).toBe('round-trip-project');
    expect(loaded.timeout).toBe(90);
    expect(loaded.verifyGlobs).toEqual(['src/**', '!dist/**']);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('overwriting config replaces all fields', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-overwrite-'));

    saveConfig(buildDefaultConfig({ projectSlug: 'first', timeout: 60 }), tmpDir);
    saveConfig(buildDefaultConfig({ projectSlug: 'second', timeout: 120 }), tmpDir);

    const loaded = loadConfig(tmpDir);
    expect(loaded.projectSlug).toBe('second');
    expect(loaded.timeout).toBe(120);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
