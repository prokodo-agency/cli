import { poll, PollTimeoutError } from './poll';

describe('poll', () => {
  it('resolves immediately when isDone returns true on first call', async () => {
    let calls = 0;
    const result = await poll({
      fn: async () => {
        calls++;
        return { status: 'success' as const };
      },
      isDone: (v) => v.status === 'success',
      timeoutMs: 5_000,
    });

    expect(result.status).toBe('success');
    expect(calls).toBe(1);
  });

  it('polls multiple times before succeeding', async () => {
    let calls = 0;
    const result = await poll({
      fn: async () => {
        calls++;
        if (calls < 3) return { status: 'running' as const };
        return { status: 'success' as const };
      },
      isDone: (v) => v.status === 'success',
      timeoutMs: 5_000,
      initialIntervalMs: 10,
      maxIntervalMs: 20,
    });

    expect(result.status).toBe('success');
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it('throws PollTimeoutError when deadline exceeded', async () => {
    await expect(
      poll({
        fn: async () => ({ status: 'running' as const }),
        isDone: () => false,
        timeoutMs: 50,
        initialIntervalMs: 10,
        maxIntervalMs: 10,
        label: 'test-timeout',
      }),
    ).rejects.toThrow(PollTimeoutError);
  });

  it('PollTimeoutError message includes the label', async () => {
    await expect(
      poll({
        fn: async () => ({ status: 'running' as const }),
        isDone: () => false,
        timeoutMs: 50,
        initialIntervalMs: 10,
        maxIntervalMs: 10,
        label: 'my-label',
      }),
    ).rejects.toThrow(/my-label/);
  });

  it('handles null result without stopping', async () => {
    let calls = 0;
    const result = await poll({
      fn: async () => {
        calls++;
        if (calls < 2) return null;
        return { status: 'success' as const };
      },
      isDone: (v) => v.status === 'success',
      timeoutMs: 2_000,
      initialIntervalMs: 10,
      maxIntervalMs: 10,
    });

    expect(result.status).toBe('success');
  });

  it('applies exponential backoff (intervals grow)', async () => {
    const intervals: number[] = [];
    let lastTime = Date.now();
    let calls = 0;

    await poll({
      fn: async () => {
        calls++;
        const now = Date.now();
        if (calls > 1) intervals.push(now - lastTime);
        lastTime = now;
        if (calls >= 4) return { done: true };
        return null;
      },
      isDone: (v) => Boolean(v.done),
      timeoutMs: 5_000,
      initialIntervalMs: 20,
      maxIntervalMs: 200,
    });

    // Each interval should be >= the previous (minus jitter tolerance)
    if (intervals.length >= 2) {
      expect(intervals[1]!).toBeGreaterThanOrEqual(intervals[0]! - 5);
    }
  });
});

// ─── PollTimeoutError ─────────────────────────────────────────────────────────

describe('PollTimeoutError', () => {
  it('has correct name and message', () => {
    const err = new PollTimeoutError('my-label', 30_000);
    expect(err.name).toBe('PollTimeoutError');
    expect(err.message).toContain('my-label');
    expect(err.message).toContain('30s');
  });

  it('is an instance of Error', () => {
    const err = new PollTimeoutError('x', 1000);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PollTimeoutError);
  });
});
