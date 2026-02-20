import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir } from './platform';

interface StoredCredentials {
  apiKey: string;
}

/** Absolute path to the credentials file. */
export function credentialsPath(): string {
  return path.join(getConfigDir(), 'credentials.json');
}

/** Load stored credentials, or null if none exist / are unreadable. */
export function loadCredentials(): StoredCredentials | null {
  const filePath = credentialsPath();
  if (!fs.existsSync(filePath)) return null;

  // Warn on sloppy permissions (unix only)
  if (process.platform !== 'win32') {
    try {
      const stat = fs.statSync(filePath);
      const mode = stat.mode & 0o777;
      if (mode > 0o600) {
        process.stderr.write(
          `[prokodo] Warning: credentials file has permissions ${mode.toString(8)}, expected 0600.\n`,
        );
      }
    } catch {
      // Ignore stat errors
    }
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as StoredCredentials;
  } catch {
    return null;
  }
}

/** Persist credentials to disk, creating parent directories as needed. */
export function saveCredentials(creds: StoredCredentials): void {
  const filePath = credentialsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(creds, null, 2), { encoding: 'utf8' });

  // Best-effort: chmod 0600 (silently ignored on Windows)
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // no-op on Windows
  }
}

/** Remove the credentials file. Returns true if it existed. */
export function deleteCredentials(): boolean {
  const filePath = credentialsPath();
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}
