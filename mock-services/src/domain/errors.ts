/**
 * The error contract every mock endpoint honours.
 *
 * Wire shape (see middleware.ts):
 *   { "error": { "code": "...", "message": "...", "details"?: [...] }, "requestId": "..." }
 *
 * Tests assert on `error.code` (stable) rather than `message` (human-facing,
 * may change) via the `toMatchErrorEnvelope` custom matcher.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'IDEMPOTENCY_CONFLICT',
  'EMAIL_EXISTS',
  'UNSUPPORTED_MEDIA_TYPE',
  'INSUFFICIENT_FUNDS',
  'INVALID_RECIPIENT',
  'LIMIT_EXCEEDED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  IDEMPOTENCY_CONFLICT: 409,
  EMAIL_EXISTS: 409,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INSUFFICIENT_FUNDS: 422,
  INVALID_RECIPIENT: 422,
  LIMIT_EXCEEDED: 422,
  INTERNAL_ERROR: 500,
};

/**
 * Any expected, client-facing failure. Thrown from domain code and route
 * handlers; the error middleware turns it into the wire envelope above.
 * Anything that is NOT a DomainError becomes a 500 INTERNAL_ERROR.
 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: string[];

  constructor(code: ErrorCode, message: string, details?: string[]) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export const isDomainError = (err: unknown): err is DomainError =>
  err instanceof DomainError;
