import type { Command } from 'commander';
import readline from 'node:readline';
import { saveCredentials, deleteCredentials, loadCredentials } from '../lib/credentials';
import { ApiClient } from '../lib/apiClient';
import { resolveApiKey, isValidKeyShape, maskKey } from '../lib/auth';
import { getDefaultApiUrl, isInteractive } from '../lib/platform';
import { success, info, emitJson, fatal } from '../lib/logger';
import type { HealthResponse } from '../types/api';

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Manage authentication credentials');

  // ── auth login ───────────────────────────────────────────────────────────
  auth
    .command('login')
    .description('Store an API key in the credentials file')
    .option('--key <key>', 'API key (omit to enter interactively)')
    .action(async (opts: { key?: string }) => {
      const jsonMode = program.opts<{ json: boolean }>().json;
      const apiUrl = program.opts<{ apiUrl: string }>().apiUrl ?? getDefaultApiUrl();

      let key: string | undefined = opts.key ?? process.env['PROKODO_API_KEY'];

      if (!key) {
        if (!isInteractive()) {
          fatal('No --key provided and stdin is not a TTY. Use: prokodo auth login --key <key>', 2);
        }
        key = await promptKey('Enter your prokodo API key: ');
      }

      if (!isValidKeyShape(key)) {
        fatal('The provided key does not look valid. Check it and try again.', 2);
      }

      // Validate against the health endpoint (non-destructive auth check)
      const client = new ApiClient({ baseUrl: apiUrl, apiKey: key });
      try {
        await client.get<HealthResponse>('/api/cli/v1/health');
      } catch (err_) {
        const msg = err_ instanceof Error ? err_.message : String(err_);
        fatal(`Could not verify the API key against ${apiUrl}: ${msg}`);
      }

      saveCredentials({ apiKey: key });

      if (jsonMode) {
        emitJson({ authenticated: true, keyHint: maskKey(key) });
      } else {
        success(`Authenticated successfully (${maskKey(key)})`);
        info(`Credentials stored at: ${(await import('../lib/credentials')).credentialsPath()}`);
      }
    });

  // ── auth logout ──────────────────────────────────────────────────────────
  auth
    .command('logout')
    .description('Remove stored credentials')
    .action(() => {
      const jsonMode = program.opts<{ json: boolean }>().json;
      const existed = deleteCredentials();

      if (jsonMode) {
        emitJson({ loggedOut: existed });
        return;
      }

      if (existed) {
        success('Credentials removed.');
      } else {
        info('No credentials were stored.');
      }
    });

  // ── auth whoami ──────────────────────────────────────────────────────────
  auth
    .command('whoami')
    .description('Show the currently configured API key (masked)')
    .action(() => {
      const jsonMode = program.opts<{ json: boolean }>().json;
      const cliFlag = program.opts<{ apiKey?: string }>().apiKey;
      const key = resolveApiKey(cliFlag);
      const hint = maskKey(key);

      if (jsonMode) {
        emitJson({ keyHint: hint });
        return;
      }

      info(`API key: ${hint}`);

      const stored = loadCredentials();
      if (stored) {
        info('Source: credentials file');
      } else if (process.env['PROKODO_API_KEY']) {
        info('Source: PROKODO_API_KEY environment variable');
      } else {
        info('Source: --api-key flag');
      }
    });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function promptKey(question: string): Promise<string> {
  return new Promise((resolve) => {
    // Write the prompt manually so we can suppress terminal echo
    process.stderr.write(question);

    const onData = (chunk: Buffer): void => {
      const text = chunk.toString();
      // Enter key (LF / CR / CRLF) signals end of input
      if (text.includes('\n') || text.includes('\r')) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stderr.write('\n');
        resolve(collected.trim());
      } else if (text === '\u0003') {
        // Ctrl-C
        process.stderr.write('\n');
        process.exit(130);
      } else if (text === '\u007F' || text === '\b') {
        // Backspace
        collected = collected.slice(0, -1);
      } else {
        collected += text;
        // Mask input — write a bullet for each character
        process.stderr.write('•');
      }
    };

    let collected = '';

    try {
      process.stdin.setRawMode(true);
    } catch {
      // setRawMode may not be available in all environments; fall back to plain readline
      const rl = readline.createInterface({ input: process.stdin, output: undefined });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }

    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}
