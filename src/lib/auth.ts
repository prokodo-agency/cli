import { loadCredentials } from './credentials';
import { isInteractive } from './platform';
import { fatal, maskKey, debug } from './logger';

/**
 * Resolve the API key using the following priority chain:
 *   1. --api-key CLI flag (passed as `cliFlag`)
 *   2. PROKODO_API_KEY environment variable
 *   3. Credentials file (~/.config/prokodo/credentials.json)
 *
 * If no key is found and the process is non-interactive, exits with code 2.
 * If no key is found and interactive, exits with code 2 with a helpful prompt hint.
 */
export function resolveApiKey(cliFlag?: string): string {
  // 1. CLI flag
  if (cliFlag && cliFlag.trim() !== '') {
    debug(`Using API key from --api-key flag (${maskKey(cliFlag)})`);
    return cliFlag.trim();
  }

  // 2. Environment variable
  const envKey = process.env['PROKODO_API_KEY'];
  if (envKey && envKey.trim() !== '') {
    debug(`Using API key from PROKODO_API_KEY env var (${maskKey(envKey)})`);
    return envKey.trim();
  }

  // 3. Credentials file
  const stored = loadCredentials();
  if (stored?.apiKey && stored.apiKey.trim() !== '') {
    debug(`Using API key from credentials file (${maskKey(stored.apiKey)})`);
    return stored.apiKey.trim();
  }

  // No key found
  if (!isInteractive()) {
    fatal(
      'No API key found. Set PROKODO_API_KEY env var or run "prokodo auth login --key <key>" first.',
      2,
    );
  }

  fatal(
    'No API key configured.\n  Run: prokodo auth login --key <your-key>\n  Or set: PROKODO_API_KEY=<your-key>',
    2,
  );
}

/** Validate that a key looks plausible (non-empty, not obviously a placeholder). */
export function isValidKeyShape(key: string): boolean {
  return key.trim().length >= 8 && !key.includes('<') && !key.includes('>');
}

export { maskKey };
