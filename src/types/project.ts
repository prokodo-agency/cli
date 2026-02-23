// Project type definitions — shared across CLI commands and API types

// TODO: 'n8n-workflow' is reserved for future use — verification logic not yet implemented.
export type ProjectType = 'n8n-node' | 'n8n-workflow';

/** Fully resolved run context — all values are concrete, no optionals. */
export interface ResolvedRunContext {
  /** Detected or configured project type. */
  projectType: ProjectType;
  /** npm package name, from package.json `name`. Present for npm-based types. */
  packageName?: string;
  /** Git remote origin URL — universal fallback identifier. */
  source?: string;
  /** File paths (relative to cwd) to include in the upload. */
  include: string[];
  /** Verification timeout in milliseconds. */
  timeoutMs: number;
}

/** Default glob patterns per project type — never exposed to the user. */
export const DEFAULT_INCLUDE: Record<ProjectType, string[]> = {
  'n8n-node': ['src', 'package.json', 'tsconfig.json'],
  // TODO: fill dynamically when n8n-workflow verification is implemented
  'n8n-workflow': [],
};

export const DEFAULT_TIMEOUT_MS = 300_000;
