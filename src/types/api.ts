// API request / response shapes for /api/cli/v1
// Kept in one file so both apiClient and commands share types without circular deps

import type { ProjectType } from './project';

// ─── Common ──────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  message: string;
  requestId: string;
}

// ─── Health ──────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok';
  apiVersion: string;
  ts: string;
}

// ─── Credits ─────────────────────────────────────────────────────────────────

export interface CreditsResponse {
  balance: number;
  unit: 'credit';
  stub: boolean;
}

// ─── Verify — start run ──────────────────────────────────────────────────────

export interface VerifyFile {
  path: string;
  contentBase64: string;
}

export interface StartRunRequest {
  /** What kind of artefact is being verified. */
  projectType: ProjectType;
  /**
   * npm package name (from package.json `name`).
   * Present for npm-based project types (e.g. n8n-node) in local project mode.
   */
  packageName?: string;
  /**
   * Git remote origin URL — universal fallback identifier.
   * Used when no packageName is available.
   */
  source?: string;
  /**
   * Published npm package reference, e.g. `@scope/name` or `@scope/name@1.2.3`.
   * When set, the server fetches the package from the npm registry instead of
   * using locally uploaded files. Mutually exclusive with `files`.
   */
  packageRef?: string;
  /** Git ref, branch, or commit SHA to tag the run. */
  ref?: string;
  /**
   * Files to verify (local project mode).
   * Omitted when `packageRef` is set.
   */
  files?: VerifyFile[];
  /** Arbitrary extra config forwarded to the runner. */
  config?: Record<string, unknown>;
}

export type RunStatus = 'queued' | 'running' | 'success' | 'failed' | 'timeout' | 'rejected';

/** reasonCode present when status === 'rejected' */
export type RunRejectReason =
  | 'INSUFFICIENT_CREDITS'
  | 'INVALID_PAYLOAD'
  | 'NOT_IMPLEMENTED'
  | 'RUNNER_ERROR'
  | 'TIMEOUT'
  | 'CONCURRENCY_CAP_REACHED';

export interface StartRunResponse {
  runId: string;
  status: 'queued';
  creditsEstimated: number;
}

// ─── Verify — poll status ────────────────────────────────────────────────────

export interface RunStatusResponse {
  runId: string;
  status: RunStatus;
  reasonCode?: RunRejectReason;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

// ─── Verify — log cursor stream ──────────────────────────────────────────────

export interface LogLine {
  seq: number;
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  msg: string;
}

export interface LogsResponse {
  lines: LogLine[];
  nextCursor: string;
  done: boolean;
}

// ─── Verify — final result ───────────────────────────────────────────────────

export interface CheckResult {
  name: string;
  passed: boolean;
  message?: string;
}

export interface RunResultResponse {
  runId: string;
  passed: boolean;
  summary: string;
  checks: CheckResult[];
  creditsUsed: number;
}
