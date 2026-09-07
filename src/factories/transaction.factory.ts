import { faker } from '@faker-js/faker';

import type { ApiClient, CreateTransactionRequest } from '../clients/api';
import type { TransactionResponse } from '../clients/types';

/**
 * Test data for transactions.
 *
 *  - `build()` — a valid request body, no I/O. Defaults to a small transfer;
 *    the caller supplies `recipientId` (it needs a real user).
 *  - `create()` — POSTs the transaction as `token` and returns the created
 *    `TransactionResponse`. Throws on a non-201.
 *
 * Amounts are random with exactly 2 decimal places so the minor-unit
 * conversion is exact and balance assertions stay deterministic.
 */

export type BuildTransactionOptions = Partial<CreateTransactionRequest>;

export interface CreateTransactionFactoryOptions extends BuildTransactionOptions {
  idempotencyKey?: string;
}

/** A valid `POST /api/transactions` body. Override `recipientId` for transfers. */
export function build(overrides: BuildTransactionOptions = {}): CreateTransactionRequest {
  return {
    type: 'transfer',
    amount: faker.number.float({ min: 1, max: 250, fractionDigits: 2 }),
    ...overrides,
  };
}

/**
 * Create a transaction as the holder of `token`. Throws (with status + body) on
 * anything other than 201 — a factory should not mask a rejected transaction.
 */
export async function create(
  api: ApiClient,
  token: string,
  overrides: CreateTransactionFactoryOptions = {},
): Promise<TransactionResponse> {
  const { idempotencyKey, ...bodyOverrides } = overrides;
  const body = build(bodyOverrides);

  const res = await api.asUser(token).transactions.create(body, { idempotencyKey });
  if (res.status !== 201) {
    throw new Error(
      `transaction.factory.create: POST /api/transactions returned ${res.status} — ${JSON.stringify(res.body)}`,
    );
  }
  return res.body;
}
