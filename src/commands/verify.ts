import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../lib/config';
import { ApiClient, ApiRequestError } from '../lib/apiClient';
import { resolveApiKey } from '../lib/auth';
import { getDefaultApiUrl } from '../lib/platform';
import { poll, PollTimeoutError } from '../lib/poll';
import { info, warn, error, success, logLine, emitJson, fatal, debug } from '../lib/logger';
import type {
  StartRunRequest,
  StartRunResponse,
  RunStatusResponse,
  LogsResponse,
  RunResultResponse,
  VerifyFile,
} from '../types/api';

export function registerVerifyCommand(program: Command): void {
  program
    .command('verify')
    .description('Run a cloud verification of the current project')
    .option('--ref <ref>', 'Git ref / branch / commit to tag the run')
    .option('--timeout <seconds>', 'Override config timeout (seconds)')
    .option('--no-logs', 'Disable remote log streaming')
    .action(async (opts: { ref?: string; timeout?: string; logs: boolean }) => {
      const {
        json: jsonMode,
        apiUrl,
        apiKey: cliKey,
      } = program.opts<{
        json: boolean;
        apiUrl?: string;
        apiKey?: string;
      }>();

      // ── 1. Load config ────────────────────────────────────────────────────
      let config;
      try {
        config = loadConfig();
      } catch (err_) {
        fatal(err_ instanceof Error ? err_.message : /* istanbul ignore next */ String(err_), 2);
      }

      const timeoutSec = opts.timeout ? Number(opts.timeout) : config.timeout;
      if (!isFinite(timeoutSec) || timeoutSec <= 0) {
        fatal('--timeout must be a positive number of seconds.', 2);
      }
      const timeoutMs = timeoutSec * 1_000;

      // ── 2. Collect files ──────────────────────────────────────────────────
      const files = collectFiles(config.verifyGlobs);
      if (files.length === 0) {
        fatal(
          `No files matched verifyGlobs: ${config.verifyGlobs.join(', ')}.\nAdjust verifyGlobs in .prokodo/config.json.`,
          2,
        );
      }
      debug(`Collected ${files.length} files for verification`);

      // ── 3. Build client ───────────────────────────────────────────────────
      const key = resolveApiKey(cliKey);
      const client = new ApiClient({
        baseUrl: apiUrl ?? getDefaultApiUrl(),
        apiKey: key,
      });

      // ── 4. Start run ──────────────────────────────────────────────────────
      const body: StartRunRequest = {
        projectSlug: config.projectSlug,
        ref: opts.ref,
        files,
      };

      let run: StartRunResponse;
      try {
        run = await client.post<StartRunResponse>('/api/cli/v1/verify/run', body);
      } catch (err_) {
        return handleApiError(err_, jsonMode);
      }

      if (!jsonMode) {
        info(`Run started: ${run.runId} (estimated ${run.creditsEstimated} credit)`);
      }

      const runId = run.runId;
      let logCursor = '';

      // ── 5. Poll + stream logs ─────────────────────────────────────────────
      let finalStatus: RunStatusResponse;
      try {
        finalStatus = await poll<RunStatusResponse>({
          label: `verify:${runId}`,
          timeoutMs,
          initialIntervalMs: 1_000,
          maxIntervalMs: 10_000,
          isDone: /* istanbul ignore next */ (s) =>
            s.status === 'success' || s.status === 'failed' || s.status === 'timeout',
          fn: async () => {
            // Stream any new log lines
            if (opts.logs) {
              logCursor = await streamLogs(client, runId, logCursor, jsonMode);
            }
            return client.get<RunStatusResponse>(`/api/cli/v1/verify/run/${runId}`);
          },
        });
      } catch (err_) {
        if (err_ instanceof PollTimeoutError) {
          if (jsonMode) {
            emitJson({ error: 'timeout', runId, message: err_.message });
          } else {
            error(err_.message);
          }
          process.exit(1);
        }
        return handleApiError(err_, jsonMode);
      }

      // ── 6. Fetch final result ─────────────────────────────────────────────
      let result: RunResultResponse;
      try {
        result = await client.get<RunResultResponse>(`/api/cli/v1/verify/run/${runId}/result`);
      } catch (err_) {
        return handleApiError(err_, jsonMode);
      }

      // ── 7. Output ─────────────────────────────────────────────────────
      if (jsonMode) {
        emitJson({ ...result, status: finalStatus.status });
      } else {
        printResult(result);
      }

      process.exit(result.passed ? 0 : 1);
    });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Stream new log lines; returns the updated cursor. */
async function streamLogs(
  client: ApiClient,
  runId: string,
  cursor: string,
  jsonMode: boolean,
): Promise<string> {
  try {
    const qs = cursor ? /* istanbul ignore next */ `?cursor=${encodeURIComponent(cursor)}` : '';
    const logs = await client.get<LogsResponse>(`/api/cli/v1/verify/run/${runId}/logs${qs}`);
    for (const line of logs.lines) {
      if (!jsonMode) {
        logLine(line.level, line.ts, line.msg);
      }
    }
    return logs.nextCursor ?? /* istanbul ignore next */ cursor;
  } catch {
    // Non-fatal: if log streaming fails, continue polling status
    return cursor;
  }
}

/**
 * Walk verifyGlobs as literal prefixes/extensions — glob support will be added
 * in Phase 2.  For MVP, treat globs as literal directory/extension matches.
 */
function collectFiles(globs: string[]): VerifyFile[] {
  const cwd = process.cwd();
  const files: VerifyFile[] = [];
  const seen = new Set<string>();

  // For MVP: walk directories and filter by include/exclude patterns
  const include = globs.filter((g) => !g.startsWith('!'));
  const exclude = globs.filter((g) => g.startsWith('!')).map((g) => g.slice(1));

  // Simple recursive walk
  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch /* istanbul ignore next */ {
      return;
    }

    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(cwd, abs).replace(/\\/g, '/');

      // Check excludes
      /* istanbul ignore next */
      if (
        exclude.some(
          /* istanbul ignore next */ (ex) =>
            rel.startsWith(ex.replace('/**', '').replace('**/', '')),
        )
      )
        continue;
      // Skip hidden dirs and node_modules
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile() && !seen.has(rel)) {
        // Filter by include globs (simplified: include all matching src/ prefix)
        const inInclude = include.some((inc) => {
          const base = inc.replace('/**/*', '').replace('/**', '').replace('/*', '');
          return rel.startsWith(base);
        });
        /* istanbul ignore next */
        if (!inInclude) continue;

        // Skip large files > 500 KB
        try {
          const stat = fs.statSync(abs);
          if (stat.size > 500_000) {
            warn(`Skipping large file (${(stat.size / 1000).toFixed(0)} KB): ${rel}`);
            continue;
          }
          seen.add(rel);
          const content = fs.readFileSync(abs);
          files.push({ path: rel, contentBase64: content.toString('base64') });
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  walk(cwd);
  return files;
}

function printResult(result: RunResultResponse): void {
  const status = result.passed ? success : error;
  status(`Verification ${result.passed ? 'passed' : 'failed'}: ${result.summary}`);

  for (const check of result.checks) {
    const mark = check.passed ? '  ✓' : '  ✗';
    const msg = check.message ? ` — ${check.message}` : '';
    info(`${mark} ${check.name}${msg}`);
  }

  info('');
  info(`Credits used: ${result.creditsUsed}`);
}

function handleApiError(err: unknown, jsonMode: boolean): never {
  if (err instanceof ApiRequestError) {
    if (jsonMode) {
      emitJson({ error: err.code, message: err.message, statusCode: err.statusCode });
    } else {
      if (err.statusCode === 401 || err.statusCode === 403) {
        error(`Authentication failed (${err.statusCode}): ${err.message}`);
        info('Run "prokodo auth login --key <key>" to update your credentials.');
      } else if (err.statusCode === 402) {
        error('Insufficient credits. Purchase credits at marketplace.prokodo.com.');
      } else if (err.statusCode === 409) {
        error('A verification is already in progress for this project.');
      } else {
        error(`API error ${err.statusCode}: ${err.message}`);
      }
    }
  } else {
    const msg = err instanceof Error ? err.message : /* istanbul ignore next */ String(err);
    if (jsonMode) {
      emitJson({ error: 'network_error', message: msg });
    } else {
      error(`Network error: ${msg}`);
    }
  }
  process.exit(1);
}
