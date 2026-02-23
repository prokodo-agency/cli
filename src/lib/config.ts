import fs from 'node:fs';
import path from 'node:path';
import type { ProjectType } from '../types/project';

/**
 * Optional project configuration stored in .prokodo/config.json.
 *
 * Every field is optional — the file itself is optional.
 * Omit any field to accept the auto-detected default.
 */
export interface ProjectConfig {
  /** Force a specific project type (default: auto-detected from package.json). */
  projectType?: ProjectType;
  /**
   * Files / directories to include in the upload.
   * Accepts relative paths from the config file directory.
   * Default: determined by projectType.
   */
  include?: string[];
  /** Verification timeout in seconds (default: 300). */
  timeout?: number;
}

const CONFIG_FILENAME = '.prokodo/config.json';

/** Resolve the config file path relative to cwd (or a given basePath). */
export function configPath(basePath: string = process.cwd()): string {
  return path.join(basePath, CONFIG_FILENAME);
}

/**
 * Load .prokodo/config.json if it exists.
 * Returns an empty config object when the file is absent.
 * Throws only on JSON parse errors or invalid field types.
 */
export function loadConfig(basePath: string = process.cwd()): ProjectConfig {
  const filePath = configPath(basePath);

  if (!fs.existsSync(filePath)) {
    return {};
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

/** Validate raw JSON and return a typed ProjectConfig, throwing on invalid shape. */
export function validateConfig(raw: unknown, source = 'config'): ProjectConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`${source}: expected a JSON object.`);
  }

  const obj = raw as Record<string, unknown>;
  const config: ProjectConfig = {};

  if ('projectType' in obj) {
    if (obj['projectType'] !== 'n8n-node' && obj['projectType'] !== 'n8n-workflow') {
      throw new Error(`${source}: "projectType" must be "n8n-node" or "n8n-workflow".`);
    }
    config.projectType = obj['projectType'] as ProjectType;
  }

  if ('include' in obj) {
    if (!Array.isArray(obj['include']) || obj['include'].some((g) => typeof g !== 'string')) {
      throw new Error(`${source}: "include" must be an array of strings.`);
    }
    config.include = obj['include'] as string[];
  }

  if ('timeout' in obj) {
    const timeout = obj['timeout'];
    if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0) {
      throw new Error(`${source}: "timeout" must be a positive number (seconds).`);
    }
    config.timeout = timeout;
  }

  return config;
}
