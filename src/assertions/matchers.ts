import { expect as baseExpect } from '@playwright/test';

import type { ApiResponse } from '../clients/http';
import type { ErrorCode, ErrorEnvelope } from '../clients/types';

/**
 * Domain matchers, layered on Playwright's `expect`. Specs import `expect` from
 * here instead of from '@playwright/test'.
 *
 *   expect(res).toMatchErrorEnvelope('INSUFFICIENT_FUNDS');
 *   expect(res).toMatchErrorEnvelope('VALIDATION_ERROR', { field: 'email' });
 *   expect(user.balance).toEqualMoney(959.75);
 *   expect(txn.createdAt).toBeIsoDateString();
 */

/**
 * Expected HTTP status per error code — the matcher's own copy of the contract.
 * If the service and this map disagree, the assertion fails (which is the point).
 */
const EXPECTED_STATUS: Record<ErrorCode, number> = {
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

const toMinor = (n: number): number => Math.round(n * 100);

export const expect = baseExpect.extend({
  /**
   * Assert a response is the standard error envelope for `code`: right HTTP
   * status, `error.code` match, non-empty `error.message`, present `requestId`.
   * `options.field` additionally checks `error.details` names that field.
   */
  toMatchErrorEnvelope(
    received: ApiResponse,
    code: ErrorCode,
    options: { field?: string } = {},
  ) {
    const problems: string[] = [];
    const expectedStatus = EXPECTED_STATUS[code];

    if (received?.status !== expectedStatus) {
      problems.push(`HTTP status was ${received?.status}, expected ${expectedStatus}`);
    }

    const body = received?.body as Partial<ErrorEnvelope> | undefined;
    if (!body || typeof body !== 'object' || !body.error) {
      problems.push(`body has no "error" object (got ${JSON.stringify(body)})`);
    } else {
      if (body.error.code !== code) {
        problems.push(`error.code was "${body.error.code}", expected "${code}"`);
      }
      if (typeof body.error.message !== 'string' || body.error.message.length === 0) {
        problems.push('error.message is missing or empty');
      }
      if (options.field) {
        const details = body.error.details ?? [];
        const named = details.some((d) => d.includes(options.field as string));
        if (!named) {
          problems.push(
            `error.details does not name "${options.field}" (got ${JSON.stringify(details)})`,
          );
        }
      }
    }

    if (typeof body?.requestId !== 'string' || body.requestId.length === 0) {
      problems.push('requestId is missing or empty');
    }

    return {
      pass: problems.length === 0,
      message: () =>
        problems.length === 0
          ? `Expected response NOT to be a valid "${code}" error envelope`
          : `Expected a valid "${code}" error envelope, but:\n  - ${problems.join('\n  - ')}`,
    };
  },

  /** Compare two decimal amounts at cent precision (avoids float noise). */
  toEqualMoney(received: number, expected: number) {
    const pass = toMinor(received) === toMinor(expected);
    return {
      pass,
      message: () =>
        `Expected ${received} to ${pass ? 'not ' : ''}equal ${expected} at 2-decimal precision`,
    };
  },

  /** Assert a value is a parseable ISO-8601 timestamp string. */
  toBeIsoDateString(received: unknown) {
    const pass =
      typeof received === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(received) &&
      !Number.isNaN(Date.parse(received));
    return {
      pass,
      message: () =>
        `Expected ${JSON.stringify(received)} to ${pass ? 'not ' : ''}be an ISO date string`,
    };
  },
});
