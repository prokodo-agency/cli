import os from 'node:os';
import path from 'node:path';

/**
 * Returns the OS-appropriate config directory for Prokodo.
 * Linux/macOS : ~/.config/prokodo
 * Windows     : %APPDATA%\prokodo
 */
export function getConfigDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'] ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'prokodo');
  }
  return path.join(os.homedir(), '.config', 'prokodo');
}

/** True when stdin is attached to a real terminal (not CI / pipe). */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY);
}

/** True inside a known CI environment. */
export function isCI(): boolean {
  return Boolean(
    process.env['CI'] ||
    process.env['GITHUB_ACTIONS'] ||
    process.env['GITLAB_CI'] ||
    process.env['CIRCLECI'] ||
    process.env['TRAVIS'],
  );
}

/** Resolve the base API URL from env or falls back to the production URL. */
export function getDefaultApiUrl(): string {
  return (
    process.env['PROKODO_API_BASE_URL']?.replace(/\/$/, '') ?? 'https://marketplace.prokodo.com'
  );
}
