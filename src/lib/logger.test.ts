import * as logger from './logger';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function captureStdout(fn: () => void): string {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: unknown }).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
  try {
    fn();
  } catch {
    // absorb errors thrown by mocked process.exit
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}

function captureStderr(fn: () => void): string {
  const chunks: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  (process.stderr as { write: unknown }).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
  try {
    fn();
  } catch {
    // absorb errors thrown by mocked process.exit
  } finally {
    process.stderr.write = original;
  }
  return chunks.join('');
}

function captureExit(fn: () => void): number | string | undefined {
  let captured: number | string | undefined;
  const original = process.exit.bind(process);
  process.exit = (code?: number | string) => {
    captured = code;
    throw new Error(`process.exit(${String(code)})`);
  };
  try {
    fn();
  } catch {
    // swallow the throw used to simulate exit
  } finally {
    process.exit = original;
  }
  return captured;
}

function resetLogger(): void {
  logger.configureLogger({ json: false, verbose: false, noColor: true });
}

// ─── maskKey ─────────────────────────────────────────────────────────────────

describe('logger.maskKey', () => {
  it('exposes last 4 and hides rest', () => {
    expect(logger.maskKey('pk_live_abcdefghij').endsWith('ghij')).toBe(true);
    expect(logger.maskKey('pk_live_abcdefghij')).not.toContain('abcde');
  });

  it('short key returns all bullets', () => {
    expect(logger.maskKey('')).toBe('••••');
    expect(logger.maskKey('abc')).toBe('••••');
  });
});

// ─── configureLogger / getLoggerOptions ──────────────────────────────────────

describe('configureLogger / getLoggerOptions', () => {
  afterEach(resetLogger);

  it('sets json mode', () => {
    logger.configureLogger({ json: true });
    expect(logger.getLoggerOptions().json).toBe(true);
  });

  it('sets verbose mode', () => {
    logger.configureLogger({ verbose: true });
    expect(logger.getLoggerOptions().verbose).toBe(true);
  });

  it('partial update preserves other fields', () => {
    logger.configureLogger({ verbose: true });
    logger.configureLogger({ json: true });
    const opts = logger.getLoggerOptions();
    expect(opts.verbose).toBe(true);
    expect(opts.json).toBe(true);
  });
});

// ─── emitJson ────────────────────────────────────────────────────────────────

describe('emitJson', () => {
  beforeEach(resetLogger);
  afterEach(resetLogger);

  it('writes valid JSON followed by newline to stdout', () => {
    const output = captureStdout(() => logger.emitJson({ passed: true, count: 42 }));
    const parsed = JSON.parse(output) as { passed: boolean; count: number };
    expect(parsed.passed).toBe(true);
    expect(parsed.count).toBe(42);
  });

  it('output ends with newline', () => {
    const output = captureStdout(() => logger.emitJson({ ok: true }));
    expect(output.endsWith('\n')).toBe(true);
  });

  it('serialises nested objects', () => {
    const payload = { checks: [{ name: 'test', passed: false }] };
    const output = captureStdout(() => logger.emitJson(payload));
    const parsed = JSON.parse(output) as typeof payload;
    expect(parsed.checks[0]?.name).toBe('test');
    expect(parsed.checks[0]?.passed).toBe(false);
  });
});

// ─── info / success ──────────────────────────────────────────────────────────

describe('info and success', () => {
  beforeEach(resetLogger);
  afterEach(resetLogger);

  it('info writes to stdout when not in json mode', () => {
    const out = captureStdout(() => logger.info('hello world'));
    expect(out).toContain('hello world');
  });

  it('info is suppressed when json mode is active', () => {
    logger.configureLogger({ json: true });
    const out = captureStdout(() => logger.info('should not appear'));
    expect(out).toBe('');
  });

  it('success is suppressed when json mode is active', () => {
    logger.configureLogger({ json: true });
    const out = captureStdout(() => logger.success('done'));
    expect(out).toBe('');
  });

  it('success writes to stdout when json mode is off', () => {
    logger.configureLogger({ json: false });
    const out = captureStdout(() => logger.success('all done'));
    expect(out).toContain('all done');
  });
});

// ─── warn / error — always go to stderr ──────────────────────────────────────

describe('warn and error', () => {
  beforeEach(resetLogger);
  afterEach(resetLogger);

  it('warn writes to stderr regardless of json mode', () => {
    const err = captureStderr(() => logger.warn('watch out'));
    expect(err).toContain('watch out');
  });

  it('error writes to stderr in json mode', () => {
    logger.configureLogger({ json: true });
    const err = captureStderr(() => logger.error('something broke'));
    expect(err).toContain('something broke');
  });
});

// ─── debug — only when verbose ────────────────────────────────────────────────

describe('debug', () => {
  beforeEach(resetLogger);
  afterEach(resetLogger);

  it('hidden when verbose is false', () => {
    logger.configureLogger({ verbose: false });
    const err = captureStderr(() => logger.debug('secret detail'));
    expect(err).toBe('');
  });

  it('shown when verbose is true', () => {
    logger.configureLogger({ verbose: true });
    const err = captureStderr(() => logger.debug('verbose detail'));
    expect(err).toContain('verbose detail');
  });
});

// ─── fatal ────────────────────────────────────────────────────────────────────

describe('fatal', () => {
  beforeEach(resetLogger);
  afterEach(resetLogger);

  it('calls process.exit(1) by default', () => {
    const code = captureExit(() => captureStderr(() => logger.fatal('boom')));
    expect(code).toBe(1);
  });

  it('calls process.exit(2) with usage error code', () => {
    const code = captureExit(() => captureStderr(() => logger.fatal('bad args', 2)));
    expect(code).toBe(2);
  });

  it('writes error message to stderr', () => {
    let errOutput = '';
    captureExit(() => {
      errOutput = captureStderr(() => logger.fatal('the fatal message'));
    });
    expect(errOutput).toContain('the fatal message');
  });
});

// ─── logLine ─────────────────────────────────────────────────────────────────

describe('logLine', () => {
  beforeEach(resetLogger);
  afterEach(resetLogger);

  it('writes to stderr', () => {
    const err = captureStderr(() =>
      logger.logLine('info', '2026-02-20T12:00:00Z', 'deploy started'),
    );
    expect(err).toContain('deploy started');
  });

  it('writes to stderr in json mode (logs never go to stdout)', () => {
    logger.configureLogger({ json: true });
    const err = captureStderr(() =>
      logger.logLine('info', '2026-02-20T12:00:00Z', 'json mode log'),
    );
    expect(err).toContain('json mode log');
  });

  it('warn level uses yellow prefix', () => {
    const err = captureStderr(() =>
      logger.logLine('warn', '2026-02-20T12:00:00Z', 'something warned'),
    );
    expect(err).toContain('something warned');
  });

  it('error level writes to stderr', () => {
    const err = captureStderr(() =>
      logger.logLine('error', '2026-02-20T12:00:00Z', 'critical failure'),
    );
    expect(err).toContain('critical failure');
  });
});
