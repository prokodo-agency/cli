import { randomUUID } from 'node:crypto';
import { debug, warn } from './logger';
import type { ApiError } from '../types/api';

const CLI_VERSION: string = (function () {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('../../package.json') as { version: string }).version;
  } catch {
    return '0.0.0';
  }
})();

export class ApiRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly requestId: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Per-request timeout in ms. Default: 30_000 */
  requestTimeout?: number;
  /** Max retry attempts for transient errors (5xx, network). Default: 3 */
  maxRetries?: number;
}

/** Sleep for `ms` milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Exponential backoff: 1s → 2s → 4s → … capped at 10s. */
function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 10_000);
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly requestTimeout: number;
  private readonly maxRetries: number;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.requestTimeout = opts.requestTimeout ?? 30_000;
    this.maxRetries = opts.maxRetries ?? 3;
  }

  private buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'X-CLI-Version': CLI_VERSION,
      'X-Request-ID': randomUUID(),
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const wait = backoffMs(attempt - 1);
        debug(`Retry attempt ${attempt}/${this.maxRetries} after ${wait}ms (${method} ${path})`);
        await sleep(wait);
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.requestTimeout);

        let response: Response;
        try {
          response = await fetch(url, {
            method,
            headers: this.buildHeaders(),
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        // Handle 429 with Retry-After
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get('retry-after') ?? '5');
          const wait = isFinite(retryAfter) ? retryAfter * 1000 : 5_000;
          warn(`Rate limited. Waiting ${retryAfter}s before retry…`);
          await sleep(wait);
          lastError = new ApiRequestError(429, 'rate_limited', 'Rate limited', '');
          continue;
        }

        // Don't retry on 4xx (except 429 handled above)
        if (response.status >= 400 && response.status < 500) {
          const err = await this.parseError(response);
          throw new ApiRequestError(response.status, err.error, err.message, err.requestId);
        }

        // Retry on 5xx
        if (response.status >= 500) {
          const err = await this.parseError(response);
          lastError = new ApiRequestError(response.status, err.error, err.message, err.requestId);
          debug(`Server error ${response.status} on attempt ${attempt}: ${err.message}`);
          continue;
        }

        // Success
        if (response.status === 204) {
          return undefined as T;
        }

        const json = await response.json();
        return json as T;
      } catch (err) {
        if (err instanceof ApiRequestError) throw err;

        // Network / abort errors — retry
        lastError = err;
        debug(`Network error on attempt ${attempt}: ${String(err)}`);
      }
    }

    // Exhausted retries
    if (lastError instanceof ApiRequestError) throw lastError;
    throw new Error(`Request failed after ${this.maxRetries} retries: ${String(lastError)}`);
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async parseError(response: Response): Promise<ApiError> {
    try {
      const json = (await response.json()) as Partial<ApiError>;
      return {
        error: json.error ?? 'unknown_error',
        message: json.message ?? response.statusText,
        requestId: json.requestId ?? '',
      };
    } catch {
      return {
        error: 'unknown_error',
        message: response.statusText,
        requestId: '',
      };
    }
  }
}
