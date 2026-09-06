import { EventEmitter } from 'node:events';

import type { TransactionType } from './ledger';

/**
 * In-process stand-in for the Redis pub/sub channel between the Transaction
 * Service and the Notification Service. The Transaction path publishes
 * `transaction.completed`; the Notification consumer (notifications.ts)
 * subscribes and writes a notification record.
 */

export interface TransactionCompletedEvent {
  type: 'transaction.completed';
  transactionId: string;
  transactionType: TransactionType;
  userId: string;
  recipientId: string | null;
  amountMinor: number;
  currency: string;
  occurredAt: string;
}

export type DomainEvent = TransactionCompletedEvent;
export type EventHandler = (event: DomainEvent) => void | Promise<void>;

export interface EventBusOptions {
  /**
   * Deliberate delivery lag in milliseconds. DO NOT set this to 0 to "speed up"
   * the suite — the delay is the point.
   *
   * In the real system `POST /api/transactions` returns 201 the instant the
   * money moves; the notification is written later, after the event crosses
   * Redis to the Notification Service. Code that reads `GET /api/notifications`
   * right after the transaction is racing that hop. Against a *synchronous* mock
   * such a test passes locally and then flakes in CI once real latency shows up.
   *
   * Keeping a real (small, jittered) delay here forces the test suite to prove
   * it handles eventual consistency properly: poll with a timeout, and assert
   * *absence* only after the full budget has elapsed. See
   * `tests/contract/notification.async.spec.ts` and `src/helpers/poll.ts`.
   */
  delayMs: number;

  /**
   * Jitter as a fraction of `delayMs` (default 0.4), applied +/-, so delivery
   * timing is never a fixed constant a test could accidentally depend on.
   */
  jitterRatio?: number;
}

export function createEventBus(opts: EventBusOptions) {
  const emitter = new EventEmitter();
  const pending = new Set<NodeJS.Timeout>();

  const publish = (event: DomainEvent): void => {
    const jitter = (opts.jitterRatio ?? 0.4) * opts.delayMs;
    const wait = Math.max(0, opts.delayMs + (Math.random() * 2 - 1) * jitter);

    const timer = setTimeout(() => {
      pending.delete(timer);
      emitter.emit(event.type, event);
    }, wait);

    // A pending notification must never hold the process open.
    timer.unref();
    pending.add(timer);
  };

  const subscribe = (type: DomainEvent['type'], handler: EventHandler): void => {
    emitter.on(type, (event: DomainEvent) => {
      void handler(event);
    });
  };

  /**
   * Drop events that were scheduled but not yet delivered. Called by
   * `/test/reset` so a notification from the previous test can't land in the
   * next test's clean state. Subscribers stay registered.
   */
  const reset = (): void => {
    for (const timer of pending) clearTimeout(timer);
    pending.clear();
  };

  return { publish, subscribe, reset };
}

export type EventBus = ReturnType<typeof createEventBus>;
