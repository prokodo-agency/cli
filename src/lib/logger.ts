import pc from 'picocolors';

export interface LoggerOptions {
  json: boolean;
  verbose: boolean;
  noColor: boolean;
}

let _opts: LoggerOptions = {
  json: false,
  verbose: false,
  noColor: Boolean(process.env['NO_COLOR']),
};

/** Configure global logger options (call once at startup). */
export function configureLogger(opts: Partial<LoggerOptions>): void {
  _opts = { ..._opts, ...opts };
  if (_opts.noColor) {
    pc.isColorSupported = false;
  }
}

export function getLoggerOptions(): LoggerOptions {
  return _opts;
}

// ─── Output helpers ──────────────────────────────────────────────────────────

/** Print a success message to stdout. */
export function success(msg: string): void {
  if (_opts.json) return;
  process.stdout.write(pc.green('✓ ') + msg + '\n');
}

/** Print an info message to stdout. */
export function info(msg: string): void {
  if (_opts.json) return;
  process.stdout.write(msg + '\n');
}

/** Print a warning to stderr. */
export function warn(msg: string): void {
  process.stderr.write(pc.yellow('⚠ ') + msg + '\n');
}

/** Print an error to stderr. */
export function error(msg: string): void {
  process.stderr.write(pc.red('✗ ') + msg + '\n');
}

/** Print a verbose/debug message to stderr (only if --verbose). */
export function debug(msg: string): void {
  if (!_opts.verbose) return;
  process.stderr.write(pc.dim('[debug] ') + msg + '\n');
}

/** Print a raw log line from a remote stream to stderr. */
export function logLine(level: string, ts: string, msg: string): void {
  if (_opts.json) {
    // When --json, remote logs still go to stderr so stdout stays clean
  }
  const prefix =
    level === 'error' ? pc.red('ERR') : level === 'warn' ? pc.yellow('WRN') : pc.dim('LOG');
  process.stderr.write(`${pc.dim(ts)} ${prefix} ${msg}\n`);
}

/**
 * Emit structured JSON to stdout and exit.
 * Used by commands when --json is active.
 */
export function emitJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

/** Fatal error: print to stderr and exit 1. */
export function fatal(msg: string, code: 1 | 2 = 1): never {
  error(msg);
  process.exit(code);
}

/** Mask an API key — only show last 4 chars. */
export function maskKey(key: string): string {
  if (key.length <= 4) return '••••';
  return '••••••••' + key.slice(-4);
}
