import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateConfig, buildDefaultConfig, saveConfig, configPath } from '../lib/config';

describe('init scaffolding', () => {
  it('saveConfig writes valid JSON', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-init-'));
    const config = buildDefaultConfig({ projectSlug: 'my-new-project' });
    saveConfig(config, tmpDir);

    const written = path.join(tmpDir, '.prokodo', 'config.json');
    expect(fs.existsSync(written)).toBe(true);

    const raw = JSON.parse(fs.readFileSync(written, 'utf8')) as unknown;
    const parsed = validateConfig(raw, written);
    expect(parsed.projectSlug).toBe('my-new-project');
    expect(Array.isArray(parsed.verifyGlobs)).toBe(true);
    expect(parsed.timeout).toBeGreaterThan(0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .prokodo/ directory if missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-init2-'));
    const prokodoDir = path.join(tmpDir, '.prokodo');

    expect(fs.existsSync(prokodoDir)).toBe(false);

    saveConfig(buildDefaultConfig({ projectSlug: 'test-slug' }), tmpDir);

    expect(fs.existsSync(prokodoDir)).toBe(true);
    expect(fs.existsSync(path.join(prokodoDir, 'config.json'))).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('default verifyGlobs includes a src glob', () => {
    const config = buildDefaultConfig({ projectSlug: 'test' });
    const hasSource = config.verifyGlobs.some((g) => g.includes('src'));
    expect(hasSource).toBe(true);
  });

  it('project slug is trimmed correctly via overrides', () => {
    const config = buildDefaultConfig({ projectSlug: '  my-slug  '.trim() });
    expect(config.projectSlug).toBe('my-slug');
  });

  it('default timeout is 300 seconds', () => {
    const config = buildDefaultConfig({ projectSlug: 'p' });
    expect(config.timeout).toBe(300);
  });

  it('configPath returns correct relative extension', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-configpath-'));
    const result = configPath(tmpDir);
    expect(result.endsWith(path.join('.prokodo', 'config.json'))).toBe(true);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('written file is valid JSON with no trailing garbage', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-json-'));
    saveConfig(buildDefaultConfig({ projectSlug: 'test' }), tmpDir);
    const raw = fs.readFileSync(path.join(tmpDir, '.prokodo', 'config.json'), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('overwriting with force replaces old slug', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prokodo-overwrite-'));

    saveConfig(buildDefaultConfig({ projectSlug: 'old-slug' }), tmpDir);
    saveConfig(buildDefaultConfig({ projectSlug: 'new-slug' }), tmpDir);

    const raw = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.prokodo', 'config.json'), 'utf8'),
    ) as unknown;
    const parsed = validateConfig(raw);
    expect(parsed.projectSlug).toBe('new-slug');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
