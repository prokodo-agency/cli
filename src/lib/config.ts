import fs from 'node:fs';
import path from 'node:path';

export interface ProjectConfig {
  projectSlug: string;
  verifyGlobs: string[];
  timeout: number;
}

const CONFIG_FILENAME = '.prokodo/config.json';

const DEFAULT_CONFIG: ProjectConfig = {
  projectSlug: '',
  verifyGlobs: ['src/**/*', '!node_modules/**'],
  timeout: 300,
};

/** Resolve the config file path relative to cwd (or a given basePath). */
export function configPath(basePath: string = process.cwd()): string {
  return path.join(basePath, CONFIG_FILENAME);
}

/** Load and validate .prokodo/config.json. Throws a descriptive error on problems. */
export function loadConfig(basePath: string = process.cwd()): ProjectConfig {
  const filePath = configPath(basePath);

  if (!fs.existsSync(filePath)) {
    throw new Error(`No config found at ${filePath}. Run "prokodo init" to create one.`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    throw new Error(`Failed to parse ${filePath} as JSON.`);
  }

  return validateConfig(raw, filePath);
}

/** Write config to disk, creating .prokodo/ if needed. */
export function saveConfig(config: ProjectConfig, basePath: string = process.cwd()): void {
  const filePath = configPath(basePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', { encoding: 'utf8' });
}

/** Returns a valid config with defaults merged in. */
export function buildDefaultConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

/** Validate raw JSON and return a typed ProjectConfig, throwing on invalid shape. */
export function validateConfig(raw: unknown, source = 'config'): ProjectConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`${source}: expected a JSON object.`);
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj['projectSlug'] !== 'string' || obj['projectSlug'].trim() === '') {
    throw new Error(`${source}: "projectSlug" must be a non-empty string.`);
  }

  if (!Array.isArray(obj['verifyGlobs']) || obj['verifyGlobs'].some((g) => typeof g !== 'string')) {
    throw new Error(`${source}: "verifyGlobs" must be an array of strings.`);
  }

  const timeout = obj['timeout'];
  if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0) {
    throw new Error(`${source}: "timeout" must be a positive number (seconds).`);
  }

  return {
    projectSlug: (obj['projectSlug'] as string).trim(),
    verifyGlobs: obj['verifyGlobs'] as string[],
    timeout,
  };
}
