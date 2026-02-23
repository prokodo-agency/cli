import type { Command } from 'commander';
import process from 'node:process';
import { loadCredentials } from '../lib/credentials';
import { loadConfig } from '../lib/config';
import { ApiClient } from '../lib/apiClient';
import { getDefaultApiUrl } from '../lib/platform';
import { resolveApiKey } from '../lib/auth';
import { info, emitJson } from '../lib/logger';
import pc from 'picocolors';
import type { HealthResponse } from '../types/api';

interface DoctorCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Check environment health (Node version, credentials, API reachability, config)')
    .action(async () => {
      const {
        json: jsonMode,
        apiUrl,
        apiKey: cliKey,
      } = program.opts<{
        json: boolean;
        apiUrl?: string;
        apiKey?: string;
      }>();

      const checks: DoctorCheck[] = [];

      // ── 1. Node version ───────────────────────────────────────────────────
      {
        const [major] = process.versions.node.split('.').map(Number);
        checks.push({
          name: 'Node version',
          passed: major >= 22,
          detail: `${process.versions.node} (required ≥ 22)`,
        });
      }

      // ── 2. Credentials ────────────────────────────────────────────────────
      {
        const hasEnv = Boolean(process.env['PROKODO_API_KEY']);
        const hasFile = Boolean(loadCredentials());
        const hasFlag = Boolean(cliKey);
        const passed = hasFlag || hasEnv || hasFile;
        const source = hasFlag
          ? '--api-key flag'
          : hasEnv
            ? 'PROKODO_API_KEY env var'
            : hasFile
              ? 'credentials file'
              : 'none';
        checks.push({
          name: 'API key configured',
          passed,
          detail: `Source: ${source}`,
        });
      }

      // ── 3. Config file ────────────────────────────────────────────────────
      {
        let passed = false;
        let detail: string;
        try {
          const cfg = loadConfig();
          passed = true;
          detail = `projectType=${cfg.projectType ?? 'auto-detected'}`;
        } catch (err) {
          detail = err instanceof Error ? err.message : /* istanbul ignore next */ String(err);
        }
        checks.push({ name: '.prokodo/config.json', passed, detail });
      }

      // ── 4. API reachability ───────────────────────────────────────────────
      {
        const baseUrl = apiUrl ?? getDefaultApiUrl();
        let passed = false;
        let detail: string;
        try {
          // Health endpoint requires no auth
          const res = await fetch(`${baseUrl}/api/cli/v1/health`, {
            signal: AbortSignal.timeout(10_000),
          });
          /* istanbul ignore else */
          if (res.ok) {
            const body = (await res.json()) as HealthResponse;
            passed = body.status === 'ok';
            detail = `${baseUrl} → OK (v${body.apiVersion})`;
          } else {
            detail = `${baseUrl} → HTTP ${res.status}`;
          }
        } catch (err) {
          detail = `${baseUrl} → ${err instanceof Error ? err.message : /* istanbul ignore next */ String(err)}`;
        }
        checks.push({ name: 'API reachability', passed, detail });
      }

      // ── 5. Auth check (if key present) ────────────────────────────────────
      {
        const hasKey =
          Boolean(cliKey) || Boolean(process.env['PROKODO_API_KEY']) || Boolean(loadCredentials());

        if (hasKey) {
          const baseUrl = apiUrl ?? getDefaultApiUrl();
          let passed = false;
          let detail: string;
          try {
            const key = resolveApiKey(cliKey);
            const client = new ApiClient({ baseUrl, apiKey: key });
            await client.get<HealthResponse>('/api/cli/v1/health');
            passed = true;
            detail = 'API key accepted';
          } catch (err) {
            detail = err instanceof Error ? err.message : /* istanbul ignore next */ String(err);
          }
          checks.push({ name: 'API key valid', passed, detail });
        }
      }

      // ── Output ────────────────────────────────────────────────────────────
      if (jsonMode) {
        const allPassed = checks.every((c) => c.passed);
        emitJson({ passed: allPassed, checks });
        process.exit(allPassed ? 0 : 1);
      }

      for (const check of checks) {
        const icon = check.passed ? pc.green('✓') : pc.red('✗');
        info(`${icon}  ${check.name.padEnd(28)} ${pc.dim(check.detail)}`);
      }

      const allPassed = checks.every((c) => c.passed);
      info('');
      if (allPassed) {
        info(pc.green('All checks passed.'));
      } else {
        const failed = checks.filter((c) => !c.passed).map((c) => c.name);
        info(pc.red(`${failed.length} check(s) failed: ${failed.join(', ')}`));
      }

      process.exit(allPassed ? 0 : 1);
    });
}
