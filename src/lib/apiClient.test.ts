import { ApiClient, ApiRequestError } from './apiClient';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type MockResponse = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

function mockFetch(responses: MockResponse[]): void {
  let idx = 0;
  globalThis.fetch = async (
    _url: string | URL | Request,
    _init?: RequestInit,
  ): Promise<Response> => {
    const mock = responses[idx++] ?? responses[responses.length - 1]!;
    return {
      ok: mock.status >= 200 && mock.status < 300,
      status: mock.status,
      statusText: 'Mock',
      headers: {
        get: (name: string): string | null =>
          ((mock.headers ?? {}) as Record<string, string>)[name] ?? null,
      } as unknown as Headers,
      json: async () => mock.body,
      text: async () => JSON.stringify(mock.body),
    } as unknown as Response;
  };
}

const BASE_URL = 'https://test.prokodo.invalid';
const API_KEY = 'pk_test_abcdefgh1234';

afterEach(() => {
  // Reset to avoid bleed between tests — Node 22 ships global fetch natively
  (globalThis as { fetch?: unknown }).fetch = undefined;
});

// ─── GET / POST basic ────────────────────────────────────────────────────────

describe('ApiClient.get', () => {
  it('returns parsed JSON on 200', async () => {
    mockFetch([{ status: 200, body: { status: 'ok', apiVersion: '1', ts: 'now' } }]);
    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 0 });
    const result = await client.get<{ status: string }>('/api/cli/v1/health');
    expect(result.status).toBe('ok');
  });

  it('returns undefined on 204 No Content', async () => {
    globalThis.fetch = async (): Promise<Response> =>
      ({
        ok: true,
        status: 204,
        statusText: 'No Content',
        headers: { get: () => null } as unknown as Headers,
        json: async () => {
          throw new Error('Should not parse 204');
        },
      }) as unknown as Response;

    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 0 });
    const result = await client.get<undefined>('/api/cli/v1/verify/run');
    expect(result).toBeUndefined();
  });

  it('throws ApiRequestError on 401', async () => {
    mockFetch([
      { status: 401, body: { error: 'invalid_key', message: 'Unauthorized', requestId: 'r1' } },
    ]);
    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 0 });
    await expect(client.get('/api/cli/v1/credits')).rejects.toMatchObject({
      statusCode: 401,
      code: 'invalid_key',
    });
  });

  it('throws ApiRequestError on 403', async () => {
    mockFetch([
      { status: 403, body: { error: 'forbidden', message: 'Forbidden', requestId: 'r2' } },
    ]);
    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 0 });
    const err = await client.get('/protected').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).statusCode).toBe(403);
  });

  it('throws ApiRequestError on 402 (insufficient credits)', async () => {
    mockFetch([
      {
        status: 402,
        body: { error: 'insufficient_credits', message: 'No credits', requestId: 'r3' },
      },
    ]);
    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 0 });
    await expect(client.get('/api/cli/v1/verify/run')).rejects.toMatchObject({
      statusCode: 402,
      code: 'insufficient_credits',
    });
  });

  it('throws ApiRequestError on 409 (run in progress)', async () => {
    mockFetch([
      {
        status: 409,
        body: { error: 'run_in_progress', message: 'Already running', requestId: 'r4' },
      },
    ]);
    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 0 });
    await expect(client.post('/api/cli/v1/verify/run', {})).rejects.toMatchObject({
      statusCode: 409,
      code: 'run_in_progress',
    });
  });
});

// ─── Retry behaviour ──────────────────────────────────────────────────────────

describe('ApiClient retry', () => {
  it('retries on 500 up to maxRetries', async () => {
    let calls = 0;
    globalThis.fetch = async (): Promise<Response> => {
      calls++;
      return {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: { get: () => null } as unknown as Headers,
        json: async () => ({ error: 'server_error', message: 'err', requestId: '' }),
      } as unknown as Response;
    };

    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 2 });
    await expect(client.get('/api')).rejects.toBeInstanceOf(ApiRequestError);
    expect(calls).toBe(3); // 1 initial + 2 retries
  });

  it('succeeds after one 500 retry', async () => {
    let calls = 0;
    globalThis.fetch = async (): Promise<Response> => {
      calls++;
      if (calls === 1) {
        return {
          ok: false,
          status: 500,
          statusText: 'Error',
          headers: { get: () => null } as unknown as Headers,
          json: async () => ({ error: 'server_error', message: 'err', requestId: '' }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null } as unknown as Headers,
        json: async () => ({ ok: true }),
      } as unknown as Response;
    };

    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 3 });
    const result = await client.get<{ ok: boolean }>('/api');
    expect(result.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('does not retry on 4xx errors', async () => {
    let calls = 0;
    globalThis.fetch = async (): Promise<Response> => {
      calls++;
      return {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: { get: () => null } as unknown as Headers,
        json: async () => ({ error: 'bad_request', message: 'Invalid payload', requestId: '' }),
      } as unknown as Response;
    };

    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 3 });
    await expect(client.post('/api', {})).rejects.toBeInstanceOf(ApiRequestError);
    expect(calls).toBe(1); // no retries
  });
});

// ─── Headers ─────────────────────────────────────────────────────────────────

describe('ApiClient headers', () => {
  it('injects Authorization and X-CLI-Version headers', async () => {
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = async (
      _url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      capturedHeaders = Object.fromEntries(
        Object.entries((init?.headers ?? {}) as Record<string, string>),
      );
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null } as unknown as Headers,
        json: async () => ({}),
      } as unknown as Response;
    };

    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 0 });
    await client.get('/test');

    expect(capturedHeaders['Authorization']).toMatch(/^Bearer /);
    expect(capturedHeaders['X-CLI-Version']).toBeTruthy();
    expect(capturedHeaders['X-Request-ID']).toBeTruthy();
  });

  it('each request gets a unique X-Request-ID', async () => {
    const requestIds: string[] = [];
    globalThis.fetch = async (
      _url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const h = (init?.headers ?? {}) as Record<string, string>;
      if (h['X-Request-ID']) requestIds.push(h['X-Request-ID']);
      return {
        ok: true,
        status: 200,
        headers: { get: () => null } as unknown as Headers,
        json: async () => ({}),
      } as unknown as Response;
    };

    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 0 });
    await client.get('/a');
    await client.get('/b');
    await client.get('/c');

    expect(requestIds).toHaveLength(3);
    expect(new Set(requestIds).size).toBe(3);
  });
});

// ─── POST ────────────────────────────────────────────────────────────────────

describe('ApiClient.post', () => {
  it('sends body as JSON', async () => {
    let receivedBody: unknown;
    globalThis.fetch = async (
      _url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      receivedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        status: 202,
        statusText: 'Accepted',
        headers: { get: () => null } as unknown as Headers,
        json: async () => ({ runId: 'abc', status: 'queued', creditsEstimated: 1 }),
      } as unknown as Response;
    };

    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 0 });
    const payload = { projectSlug: 'test', files: [] };
    await client.post('/api/cli/v1/verify/run', payload);
    expect(receivedBody).toEqual(payload);
  });
});

// ─── 429 rate limiting ───────────────────────────────────────────────────────

describe('ApiClient 429 rate limiting', () => {
  it('retries after 429 and succeeds on next attempt', async () => {
    jest.useFakeTimers();
    let calls = 0;
    globalThis.fetch = async (): Promise<Response> => {
      calls++;
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: { get: (n: string) => (n === 'retry-after' ? '0' : null) } as unknown as Headers,
          json: async () => ({}),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null } as unknown as Headers,
        json: async () => ({ ok: true }),
      } as unknown as Response;
    };

    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 2 });
    const promise = client.get<{ ok: boolean }>('/api');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(2);
    jest.useRealTimers();
  });

  it('throws ApiRequestError after exhausting retries on repeated 429', async () => {
    jest.useFakeTimers();
    globalThis.fetch = async (): Promise<Response> =>
      ({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        // No retry-after header → triggers the `?? '5'` fallback branch
        headers: { get: () => null } as unknown as Headers,
        json: async () => ({}),
      }) as unknown as Response;

    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 1 });
    // Capture rejection immediately to prevent unhandled rejection
    const result = client.get('/api').catch((e: unknown) => e);
    await jest.runAllTimersAsync();
    const err = await result;
    expect(err).toBeInstanceOf(ApiRequestError);
    jest.useRealTimers();
  });

  it('uses 5s fallback when retry-after is not a finite number', async () => {
    jest.useFakeTimers();
    let calls = 0;
    globalThis.fetch = async (): Promise<Response> => {
      calls++;
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          // Non-numeric retry-after triggers the 5_000 ms fallback branch
          headers: {
            get: (n: string) => (n === 'retry-after' ? 'notanumber' : null),
          } as unknown as Headers,
          json: async () => ({}),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null } as unknown as Headers,
        json: async () => ({ ok: true }),
      } as unknown as Response;
    };

    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 2 });
    const promise = client.get<{ ok: boolean }>('/api');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.ok).toBe(true);
    jest.useRealTimers();
  });

  it('uses default maxRetries (3) when not supplied', async () => {
    // This covers the `opts.maxRetries ?? 3` branch in the constructor
    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY });
    // Just verify the client can be instantiated and used
    globalThis.fetch = async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null } as unknown as Headers,
        json: async () => ({ defaults: true }),
      }) as unknown as Response;
    const result = await client.get<{ defaults: boolean }>('/test');
    expect(result.defaults).toBe(true);
  });
});

// ─── Network / abort errors ──────────────────────────────────────────────────

describe('ApiClient network errors', () => {
  it('retries on network error and eventually succeeds', async () => {
    jest.useFakeTimers();
    let calls = 0;
    globalThis.fetch = async (): Promise<Response> => {
      calls++;
      if (calls === 1) throw new Error('ECONNREFUSED');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null } as unknown as Headers,
        json: async () => ({ recovered: true }),
      } as unknown as Response;
    };

    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 2 });
    const promise = client.get<{ recovered: boolean }>('/api');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.recovered).toBe(true);
    jest.useRealTimers();
  });

  it('throws generic error after exhausting network error retries', async () => {
    jest.useFakeTimers();
    globalThis.fetch = async (): Promise<Response> => {
      throw new Error('ECONNREFUSED');
    };

    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 1 });
    // Capture rejection immediately
    const result = client.get('/api').catch((e: unknown) => e);
    await jest.runAllTimersAsync();
    const err = await result;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/Request failed after 1 retries/);
    jest.useRealTimers();
  });
});

// ─── parseError catch ────────────────────────────────────────────────────────

describe('ApiClient parseError', () => {
  it('handles response where json() throws (falls back to statusText)', async () => {
    globalThis.fetch = async (): Promise<Response> =>
      ({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        headers: { get: () => null } as unknown as Headers,
        json: async (): Promise<unknown> => {
          throw new Error('JSON decode failed');
        },
      }) as unknown as Response;

    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 0 });
    const err = await client.get('/api').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).statusCode).toBe(422);
    expect((err as ApiRequestError).code).toBe('unknown_error');
  });

  it('handles 5xx response where json() throws and exhausts retries', async () => {
    jest.useFakeTimers();
    globalThis.fetch = async (): Promise<Response> =>
      ({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: { get: () => null } as unknown as Headers,
        json: async (): Promise<unknown> => {
          throw new Error('JSON decode failed');
        },
      }) as unknown as Response;

    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 1 });
    // Capture rejection immediately to prevent unhandled rejection
    const result = client.get('/api').catch((e: unknown) => e);
    await jest.runAllTimersAsync();
    const err = await result;
    expect(err).toBeInstanceOf(ApiRequestError);
    jest.useRealTimers();
  });

  it('falls back gracefully when error response has missing fields', async () => {
    globalThis.fetch = async (): Promise<Response> =>
      ({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: { get: () => null } as unknown as Headers,
        json: async () => ({}), // no error/message/requestId fields
      }) as unknown as Response;

    const client = new ApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, maxRetries: 0 });
    const err = await client.get('/api').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).code).toBe('unknown_error');
    expect((err as ApiRequestError).message).toBe('Bad Request'); // fell back to statusText
  });
});
