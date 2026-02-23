import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  DEFAULT_INCLUDE,
  DEFAULT_TIMEOUT_MS,
  type ProjectType,
  type ResolvedRunContext,
} from '../types/project';
import { loadConfig, type ProjectConfig } from './config';

// ─── package.json detection ───────────────────────────────────────────────────

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function readPackageJson(cwd: string): PackageJson | undefined {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as PackageJson;
  } catch {
    return undefined;
  }
}

function detectProjectType(pkg: PackageJson | undefined): ProjectType {
  if (!pkg) return 'n8n-node'; // default when no package.json
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
  };
  const hasN8nBase = 'n8n-workflow-base' in allDeps || 'n8n-core' in allDeps || 'n8n' in allDeps;
  if (hasN8nBase) return 'n8n-node';
  return 'n8n-node'; // safe default until more types are added
}

// ─── git remote detection ────────────────────────────────────────────────────

function detectGitSource(cwd: string): string | undefined {
  try {
    const remote = execSync('git remote get-url origin', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3_000,
    })
      .toString()
      .trim();
    return remote || undefined;
  } catch {
    return undefined;
  }
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Resolve a complete run context for `prokodo verify`.
 *
 * Priority chain (highest → lowest):
 *   CLI flag / argument  >  .prokodo/config.json  >  package.json auto-detect  >  defaults
 *
 * @param cwd          Working directory (defaults to process.cwd())
 * @param overrides    Values from CLI flags (--type, --timeout)
 */
export function resolveRunContext(
  cwd: string = process.cwd(),
  overrides: {
    projectType?: ProjectType;
    timeoutSec?: number;
    // TODO: add `file?: string` here when n8n-workflow verification is implemented
  } = {},
): ResolvedRunContext {
  // ── 1. Read optional .prokodo/config.json ──────────────────────────────────
  let config: ProjectConfig = {};
  try {
    config = loadConfig(cwd);
  } catch {
    // No config — that's fine
  }

  // ── 2. Read package.json ───────────────────────────────────────────────────
  const pkg = readPackageJson(cwd);

  // ── 3. Determine project type ──────────────────────────────────────────────
  // TODO: when n8n-workflow is supported, detect via file arg here
  const projectType: ProjectType =
    overrides.projectType ?? config.projectType ?? detectProjectType(pkg);

  // ── 4. packageName & source ───────────────────────────────────────────────
  const packageName = pkg?.name;
  const source = detectGitSource(cwd);

  // ── 5. Resolve include list (files to upload) ─────────────────────────────
  // TODO: when n8n-workflow file arg is supported, inject it as the sole include entry here
  let include: string[];
  if (config.include && config.include.length > 0) {
    // User override in config
    include = config.include;
  } else {
    include = DEFAULT_INCLUDE[projectType];
  }

  // ── 6. Timeout ────────────────────────────────────────────────────────────
  const timeoutMs =
    overrides.timeoutSec !== null && overrides.timeoutSec !== undefined
      ? overrides.timeoutSec * 1_000
      : (config.timeout ?? DEFAULT_TIMEOUT_MS / 1_000) * 1_000;

  return { projectType, packageName, source, include, timeoutMs };
}
