import { randomUUID } from 'node:crypto';

import { DomainError, type ErrorCode } from './errors';

/**
 * In-memory ledger for the mock stack. Stands in for the User Service and
 * Transaction Service (+ their MongoDB) as one synchronous store.
 *
 * Money is integer MINOR units (cents) end to end — no floats, no rounding.
 * All mutation happens in a single synchronous block per call, so balance
 * changes are effectively atomic (Node runs it to completion before the next
 * request). `createLedger` is a factory, not a singleton: app.ts owns the one
 * instance and the /test control plane calls `reset()` / `seed()` on it.
 */

export type AccountType = 'free' | 'premium';
export type TransactionType = 'transfer' | 'deposit' | 'withdrawal';
export type TransactionStatus = 'completed' | 'failed';

export interface User {
  id: string;
  name: string;
  email: string;
  accountType: AccountType;
  balanceMinor: number;
  createdAt: string;
}

export interface Transaction {
  id: string;
  userId: string;
  recipientId: string | null;
  amountMinor: number;
  currency: string;
  type: TransactionType;
  status: TransactionStatus;
  failureReason: string | null; // ErrorCode of the rule that failed, when status === 'failed'
  idempotencyKey: string | null;
  createdAt: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  accountType: AccountType;
}

export interface CreateTransactionInput {
  userId: string; // resolved from the caller's token by the route layer
  type: TransactionType;
  amountMinor: number;
  recipientId?: string | null;
  idempotencyKey?: string | null;
}

export interface SeedInput {
  users?: Array<Partial<Pick<User, 'name' | 'email' | 'accountType' | 'balanceMinor'>>>;
}

export interface LedgerOptions {
  openingBalanceMinor: number;
  maxTransferMinor: number;
  currency?: string;
}

/** $1,000,000.00 — a transfer at or above this is rejected with LIMIT_EXCEEDED. */
export const DEFAULT_MAX_TRANSFER_MINOR = 100000000;

export function createLedger(opts: LedgerOptions) {
  const currency = opts.currency ?? 'USD';

  const users = new Map<string, User>();
  const transactions = new Map<string, Transaction>();
  const idempotency = new Map<string, { hash: string; transactionId: string }>();

  const reset = (): void => {
    users.clear();
    transactions.clear();
    idempotency.clear();
  };

  const findByEmail = (email: string): User | undefined => {
    const target = email.trim().toLowerCase();
    for (const u of users.values()) {
      if (u.email.toLowerCase() === target) return u;
    }
    return undefined;
  };

  const createUser = (input: CreateUserInput): User => {
    if (findByEmail(input.email)) {
      throw new DomainError('EMAIL_EXISTS', `A user with email "${input.email}" already exists`);
    }
    const user: User = {
      id: randomUUID(),
      name: input.name.trim(),
      email: input.email.trim(),
      accountType: input.accountType,
      balanceMinor: opts.openingBalanceMinor,
      createdAt: new Date().toISOString(),
    };
    users.set(user.id, user);
    return user;
  };

  const getUser = (id: string): User | undefined => users.get(id);

  const requireUser = (id: string): User => {
    const user = users.get(id);
    if (!user) throw new DomainError('NOT_FOUND', `User "${id}" not found`);
    return user;
  };

  /**
   * A user's transaction history, newest first: everything they initiated, plus
   * transfers they *received* — but only completed ones. A failed transfer is
   * only meaningful to the person who attempted it, so it stays out of the
   * recipient's history.
   */
  const listTransactions = (userId: string): Transaction[] =>
    [...transactions.values()]
      .filter(
        (t) =>
          t.userId === userId ||
          (t.recipientId === userId && t.status === 'completed'),
      )
      .reverse();

  const getTransaction = (id: string): Transaction | undefined => transactions.get(id);

  const hashRequest = (i: CreateTransactionInput): string =>
    JSON.stringify({
      userId: i.userId,
      type: i.type,
      amountMinor: i.amountMinor,
      recipientId: i.recipientId ?? null,
    });

  const record = (
    input: CreateTransactionInput,
    status: TransactionStatus,
    failureReason: string | null,
  ): Transaction => {
    const txn: Transaction = {
      id: randomUUID(),
      userId: input.userId,
      recipientId: input.recipientId ?? null,
      amountMinor: input.amountMinor,
      currency,
      type: input.type,
      status,
      failureReason,
      idempotencyKey: input.idempotencyKey ?? null,
      createdAt: new Date().toISOString(),
    };
    transactions.set(txn.id, txn);
    return txn;
  };

  /** Persist a failed transaction (so it shows in history) and throw the matching error. */
  const reject = (input: CreateTransactionInput, code: ErrorCode, message: string): never => {
    record(input, 'failed', code);
    throw new DomainError(code, message);
  };

  const createTransaction = (
    input: CreateTransactionInput,
  ): { transaction: Transaction; replayed: boolean } => {
    const key = input.idempotencyKey ?? null;

    if (key) {
      const seen = idempotency.get(key);
      if (seen) {
        if (seen.hash !== hashRequest(input)) {
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            `Idempotency-Key "${key}" was already used with a different request body`,
          );
        }
        return { transaction: requireTransaction(seen.transactionId), replayed: true };
      }
    }

    const sender = requireUser(input.userId);

    if (input.amountMinor >= opts.maxTransferMinor) {
      reject(input, 'LIMIT_EXCEEDED', `Amount exceeds the per-transaction limit`);
    }

    if (input.type === 'transfer' || input.type === 'withdrawal') {
      if (sender.balanceMinor < input.amountMinor) {
        reject(input, 'INSUFFICIENT_FUNDS', 'Insufficient funds for this transaction');
      }
    }

    if (input.type === 'transfer') {
      const recipient = input.recipientId ? users.get(input.recipientId) : undefined;
      if (!recipient) {
        record(input, 'failed', 'INVALID_RECIPIENT');
        throw new DomainError(
          'INVALID_RECIPIENT',
          `Recipient "${input.recipientId}" does not exist`,
        );
      }
      sender.balanceMinor -= input.amountMinor;
      recipient.balanceMinor += input.amountMinor;
    } else if (input.type === 'deposit') {
      sender.balanceMinor += input.amountMinor;
    } else {
      sender.balanceMinor -= input.amountMinor;
    }

    const transaction = record(input, 'completed', null);
    if (key) idempotency.set(key, { hash: hashRequest(input), transactionId: transaction.id });
    return { transaction, replayed: false };
  };

  const requireTransaction = (id: string): Transaction => {
    const txn = transactions.get(id);
    if (!txn) throw new DomainError('INTERNAL_ERROR', `Transaction "${id}" vanished`);
    return txn;
  };

  const seed = (input: SeedInput): { users: User[] } => {
    const created = (input.users ?? []).map((u) => {
      const user = createUser({
        name: u.name ?? 'Seed User',
        email: u.email ?? `seed-${randomUUID()}@test.local`,
        accountType: u.accountType ?? 'free',
      });
      if (typeof u.balanceMinor === 'number') user.balanceMinor = u.balanceMinor;
      return user;
    });
    return { users: created };
  };

  const snapshot = () => ({
    users: [...users.values()],
    transactions: [...transactions.values()],
    idempotencyKeys: [...idempotency.keys()],
  });

  return {
    reset,
    seed,
    snapshot,
    createUser,
    getUser,
    getUserByEmail: findByEmail,
    listTransactions,
    getTransaction,
    createTransaction,
  };
}

export type Ledger = ReturnType<typeof createLedger>;
