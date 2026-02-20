// API request / response shapes for /api/cli/v1
// Kept in one file so both apiClient and commands share types without circular deps

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
  projectSlug: string;
  ref?: string;
  files: VerifyFile[];
  config?: Record<string, unknown>;
}

export type RunStatus = 'queued' | 'running' | 'success' | 'failed' | 'timeout';

export interface StartRunResponse {
  runId: string;
  status: 'queued';
  creditsEstimated: number;
}

// ─── Verify — poll status ────────────────────────────────────────────────────

export interface RunStatusResponse {
  runId: string;
  status: RunStatus;
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
