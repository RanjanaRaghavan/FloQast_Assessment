import type { APIRequestContext } from '@playwright/test';

import type { ErrorEnvelope } from './types';

/**
 * Thin transport over Playwright's APIRequestContext.
 *
 * Design choices:
 *  - Never throws on a non-2xx response. HTTP status IS the thing under test, so
 *    every call returns a result object and the spec asserts on it.
 *  - Every exchange is recorded on a `RequestLog`. A fixture attaches that log
 *    to the test report ONLY when the test fails — green runs stay clean.
 *  - The base URL comes from the Playwright project (`use.baseURL`), so callers
 *    pass paths like `/api/users`, never full URLs.
 */

export interface ApiResponse<T = unknown> {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: T;
  requestId: string | undefined;
}

export interface RequestOptions {
  /** Bearer token for this call; overrides the client's default token. */
  token?: string;
  /** Extra or overriding headers. */
  headers?: Record<string, string>;
  /** Send this exact string as the body (for malformed-body negative tests). */
  rawBody?: string;
  /** Override the Content-Type, or pass `null` to omit it (wrong-media-type tests). */
  contentType?: string | null;
}

interface Exchange {
  method: string;
  path: string;
  requestBody: unknown;
  status: number;
  responseBody: unknown;
  durationMs: number;
}

const SENSITIVE_KEYS = new Set(['token', 'authorization', 'password']);

/** Recursively mask secret-ish fields so the attached log is safe to read. */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) =>
        SENSITIVE_KEYS.has(key.toLowerCase()) ? [key, '***'] : [key, redact(val)],
      ),
    );
  }
  return value;
}

/** Collects request/response pairs for one test; formatted into a failure attachment. */
export class RequestLog {
  private readonly exchanges: Exchange[] = [];

  record(exchange: Exchange): void {
    this.exchanges.push(exchange);
  }

  get count(): number {
    return this.exchanges.length;
  }

  clear(): void {
    this.exchanges.length = 0;
  }

  format(): string {
    if (this.exchanges.length === 0) return '(no API calls recorded)';
    return this.exchanges
      .map((e, i) => {
        const head = `#${i + 1}  ${e.method} ${e.path}  ->  ${e.status}  (${e.durationMs}ms)`;
        const req =
          e.requestBody === undefined
            ? null
            : `     request:  ${JSON.stringify(redact(e.requestBody))}`;
        const res = `     response: ${JSON.stringify(redact(e.responseBody))}`;
        return [head, req, res].filter(Boolean).join('\n');
      })
      .join('\n\n');
  }
}

export class HttpClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly log: RequestLog,
    private readonly defaultToken?: string,
  ) {}

  /** A copy of this client that authenticates as the given token by default. */
  withToken(token: string | undefined): HttpClient {
    return new HttpClient(this.request, this.log, token);
  }

  get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.send<T>('GET', path, undefined, options);
  }

  post<T>(path: string, data?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.send<T>('POST', path, data, options);
  }

  delete<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.send<T>('DELETE', path, undefined, options);
  }

  private async send<T>(
    method: string,
    path: string,
    data: unknown,
    options: RequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const token = options.token ?? this.defaultToken;
    const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
    if (token) headers.authorization = `Bearer ${token}`;

    const sendingBody = options.rawBody !== undefined || data !== undefined;
    if (sendingBody && options.contentType !== null) {
      headers['content-type'] = options.contentType ?? 'application/json';
    }

    const body =
      options.rawBody !== undefined
        ? options.rawBody
        : data !== undefined
          ? JSON.stringify(data)
          : undefined;

    const started = Date.now();
    const res = await this.request.fetch(path, {
      method,
      headers,
      ...(body !== undefined ? { data: body } : {}),
    });
    const durationMs = Date.now() - started;

    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    this.log.record({
      method,
      path,
      requestBody: options.rawBody ?? data,
      status: res.status(),
      responseBody: parsed,
      durationMs,
    });

    return {
      status: res.status(),
      ok: res.ok(),
      headers: res.headers(),
      body: parsed as T,
      requestId: res.headers()['x-request-id'],
    };
  }

  /** Type guard: does this response body look like the standard error envelope? */
  static isErrorEnvelope(body: unknown): body is ErrorEnvelope {
    return (
      !!body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof (body as ErrorEnvelope).error?.code === 'string'
    );
  }
}
