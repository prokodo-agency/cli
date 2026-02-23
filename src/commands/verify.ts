import type { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { resolveRunContext } from '../lib/resolveRunContext';
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
import type { ProjectType } from '../types/project';

export function registerVerifyCommand(program: Command): void {
  program
    .command('verify [file]')
    .description(
      'Run a cloud verification of the current project.\n' +
        'Pass an npm package name to verify a published package (e.g. @scope/name or @scope/name@1.2.3).\n' +
        'Requires --type when verifying a published package.',
    )
    .option('--type <type>', 'Project type override (currently only n8n-node is supported)')
    .option('--ref <ref>', 'Git ref / branch / commit to tag the run')
    .option('--timeout <seconds>', 'Override verification timeout (seconds)')
    .option('--no-logs', 'Disable remote log streaming')
    .action(
      async (
        file: string | undefined,
        opts: { type?: string; ref?: string; timeout?: string; logs: boolean },
      ) => {
        const {
          json: jsonMode,
          apiUrl,
          apiKey: cliKey,
        } = program.opts<{
          json: boolean;
          apiUrl?: string;
          apiKey?: string;
        }>();

        // ── 1. Validate --type flag if provided ────────────────────────────────
        if (opts.type && opts.type !== 'n8n-node') {
          if (opts.type === 'n8n-workflow') {
            // TODO: implement n8n-workflow verification before enabling this path
            fatal('n8n-workflow verification is not yet supported.', 2);
          }
          fatal(`--type must be "n8n-node", got "${opts.type}".`, 2);
        }

        // ── 2. Detect positional argument mode ─────────────────────────────────
        let npmPackageRef: string | undefined;
        if (file) {
          if (isNpmPackageArg(file)) {
            npmPackageRef = file;
          } else {
            // TODO: re-enable file path once n8n-workflow file verification is implemented
            fatal(
              'Verifying a single workflow file is not yet supported. Pass an npm package name (e.g. "@scope/name") or run "prokodo verify" without arguments to verify the local project.',
              2,
            );
          }
        }

        // ── 3. npm package mode: --type is required ────────────────────────────
        if (npmPackageRef !== undefined && !opts.type) {
          fatal(
            '--type is required when verifying an npm package (e.g. prokodo verify @scope/name --type n8n-node).',
            2,
          );
        }

        // ── 4. Validate --timeout flag early ────────────────────────────────────
        if (opts.timeout !== undefined) {
          const rawTimeout = Number(opts.timeout);
          if (!isFinite(rawTimeout) || rawTimeout <= 0) {
            fatal('--timeout must be a positive number of seconds.', 2);
          }
        }

        // ── 5. Resolve context / collect files (local) or use npm package ref ──
        let body: StartRunRequest;
        let timeoutMs: number;

        if (npmPackageRef !== undefined) {
          // npm package mode: no local file collection
          body = {
            projectType: opts.type as ProjectType,
            packageRef: npmPackageRef,
            ref: opts.ref,
          };
          timeoutMs = opts.timeout ? Number(opts.timeout) * 1_000 : 300_000;
          if (!jsonMode) {
            info(`Verifying npm package: ${npmPackageRef}`);
          }
        } else {
          // local project mode
          const ctx = resolveRunContext(process.cwd(), {
            projectType: opts.type as ProjectType | undefined,
            timeoutSec: opts.timeout ? Number(opts.timeout) : undefined,
          });

          if (!isFinite(ctx.timeoutMs) || ctx.timeoutMs <= 0) {
            fatal('--timeout must be a positive number of seconds.', 2);
          }

          debug(
            `Resolved context: type=${ctx.projectType} packageName=${ctx.packageName ?? 'n/a'} ` +
              `include=[${ctx.include.join(', ')}]`,
          );

          // TODO: pass explicit file here once n8n-workflow verification is implemented
          const files = collectFiles(ctx.include);
          if (files.length === 0) {
            fatal(
              `No files found to verify. Add an "include" list to .prokodo/config.json or pass a file path.`,
              2,
            );
          }
          debug(`Collected ${files.length} file(s) for verification`);

          body = {
            projectType: ctx.projectType,
            packageName: ctx.packageName,
            source: ctx.source,
            ref: opts.ref,
            files,
          };
          timeoutMs = ctx.timeoutMs;
        }

        // ── 6. Build client ────────────────────────────────────────────────────
        const key = resolveApiKey(cliKey);
        const client = new ApiClient({
          baseUrl: apiUrl ?? getDefaultApiUrl(),
          apiKey: key,
        });

        // ── 7. Start run ───────────────────────────────────────────────────────

        let run: StartRunResponse;
        try {
          run = await client.post<StartRunResponse>('/api/cli/v1/verify/runs', body);
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
              s.status === 'success' ||
              s.status === 'failed' ||
              s.status === 'timeout' ||
              s.status === 'rejected',
            fn: async () => {
              // Stream any new log lines
              if (opts.logs) {
                logCursor = await streamLogs(client, runId, logCursor, jsonMode);
              }
              return client.get<RunStatusResponse>(`/api/cli/v1/verify/runs/${runId}`);
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

        // ── 6. Handle rejected runs before fetching result ────────────────────
        if (finalStatus.status === 'rejected') {
          const reason = finalStatus.reasonCode ?? 'RUNNER_ERROR';
          if (jsonMode) {
            emitJson({ error: 'run_rejected', runId, reasonCode: reason });
          } else {
            const messages: Record<string, string> = {
              INSUFFICIENT_CREDITS:
                'Insufficient credits. Purchase credits at marketplace.prokodo.com.',
              NOT_IMPLEMENTED: 'Verify pipeline is not yet available. Check back soon.',
              CONCURRENCY_CAP_REACHED: 'Worker at capacity. Retry shortly.',
              INVALID_PAYLOAD: 'Run rejected: invalid payload.',
              RUNNER_ERROR: 'Run rejected due to an internal error.',
              TIMEOUT: 'Run timed out.',
            };
            error(messages[reason] ?? `Run rejected: ${reason}`);
          }
          process.exit(1);
        }

        // ── 7. Fetch final result ─────────────────────────────────────────────
        let result: RunResultResponse;
        try {
          result = await client.get<RunResultResponse>(`/api/cli/v1/verify/runs/${runId}/result`);
        } catch (err_) {
          return handleApiError(err_, jsonMode);
        }

        // ── 8. Output ─────────────────────────────────────────────────────
        if (jsonMode) {
          emitJson({ ...result, status: finalStatus.status });
        } else {
          printResult(result);
        }

        process.exit(result.passed ? 0 : 1);
      },
    );
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
    const logs = await client.get<LogsResponse>(`/api/cli/v1/verify/runs/${runId}/logs${qs}`);
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
 * Returns true when `arg` looks like an npm package name rather than a file path.
 * Scoped packages (@scope/name) and bare names (my-package) qualify.
 * Paths (./foo, /foo, foo/bar) and files (foo.json) do not.
 */
function isNpmPackageArg(arg: string): boolean {
  if (arg.startsWith('@')) return true; // scoped: @scope/name
  if (arg.startsWith('.') || arg.startsWith('/') || arg.startsWith('\\')) return false;
  if (arg.endsWith('.json') || arg.endsWith('.js') || arg.endsWith('.ts')) return false;
  if (arg.includes('/') || arg.includes('\\')) return false;
  return true; // bare name like "my-package" or "my-package@1.2.3"
}

/**
 * Collect files from the include list.
 * Each entry is either a directory (walk it) or a single file path.
 * When `explicitFile` is provided, only that file is read.
 */
function collectFiles(include: string[], explicitFile?: string): VerifyFile[] {
  const cwd = process.cwd();
  const files: VerifyFile[] = [];
  const seen = new Set<string>();

  // Single-file mode (n8n workflow or any explicit path)
  /* istanbul ignore next -- collectFiles(include, explicitFile) is reserved for future n8n-workflow file mode */
  if (explicitFile) {
    const abs = path.resolve(cwd, explicitFile);
    const rel = path.relative(cwd, abs).replace(/\\/g, '/');
    try {
      const stat = fs.statSync(abs);
      if (stat.size > 500_000) {
        warn(`Skipping large file (${(stat.size / 1000).toFixed(0)} KB): ${rel}`);
        return [];
      }
      const content = fs.readFileSync(abs);
      return [{ path: rel, contentBase64: content.toString('base64') }];
    } catch {
      return [];
    }
  }

  // Multi-file mode: walk each include entry
  for (const entry of include) {
    const abs = path.resolve(cwd, entry);

    // Plain file
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      const rel = path.relative(cwd, abs).replace(/\\/g, '/');
      if (!seen.has(rel)) {
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
          // skip unreadable
        }
      }
      continue;
    }

    // Directory — walk recursively
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      walkDir(abs, cwd, seen, files);
    }
  }

  return files;
}

function walkDir(dir: string, cwd: string, seen: Set<string>, files: VerifyFile[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch /* istanbul ignore next */ {
    return;
  }

  for (const entry of entries) {
    // Skip hidden files/dirs and node_modules
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const abs = path.join(dir, entry.name);
    const rel = path.relative(cwd, abs).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      walkDir(abs, cwd, seen, files);
    } else if (entry.isFile() && !seen.has(rel)) {
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
        // skip unreadable
      }
    }
  }
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
      } else if (err.statusCode === 503) {
        error(`Service unavailable: ${err.message}. Retry shortly.`);
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
