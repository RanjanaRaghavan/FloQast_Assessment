import { randomUUID } from 'node:crypto';

import type { EventBus } from './event-bus';

/**
 * Stand-in for the Notification Service (+ its Redis store). It subscribes to
 * `transaction.completed` on the event bus and writes a notification record per
 * recipient. Because the bus delivers with a deliberate delay, a notification
 * appears *after* the originating POST /api/transactions has already returned —
 * which is exactly what the async notification tests exercise.
 */

export type NotificationKind =
  | 'transfer_sent'
  | 'transfer_received'
  | 'deposit_completed'
  | 'withdrawal_completed';

export interface Notification {
  id: string;
  userId: string;
  transactionId: string;
  channel: 'email';
  kind: NotificationKind;
  message: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
}

const formatMoney = (amountMinor: number, currency: string): string =>
  `${(amountMinor / 100).toFixed(2)} ${currency}`;

export function createNotificationService(deps: { bus: EventBus }) {
  const byId = new Map<string, Notification>();

  const add = (
    fields: Pick<
      Notification,
      'userId' | 'transactionId' | 'kind' | 'message' | 'amountMinor' | 'currency'
    >,
  ): Notification => {
    const notification: Notification = {
      id: randomUUID(),
      channel: 'email',
      createdAt: new Date().toISOString(),
      ...fields,
    };
    byId.set(notification.id, notification);
    return notification;
  };

  deps.bus.subscribe('transaction.completed', (event) => {
    const money = formatMoney(event.amountMinor, event.currency);
    const base = {
      transactionId: event.transactionId,
      amountMinor: event.amountMinor,
      currency: event.currency,
    };

    if (event.transactionType === 'transfer') {
      add({ ...base, userId: event.userId, kind: 'transfer_sent', message: `You sent ${money}` });
      if (event.recipientId) {
        add({
          ...base,
          userId: event.recipientId,
          kind: 'transfer_received',
          message: `You received ${money}`,
        });
      }
    } else if (event.transactionType === 'deposit') {
      add({
        ...base,
        userId: event.userId,
        kind: 'deposit_completed',
        message: `Your deposit of ${money} completed`,
      });
    } else {
      add({
        ...base,
        userId: event.userId,
        kind: 'withdrawal_completed',
        message: `Your withdrawal of ${money} completed`,
      });
    }
  });

  /** A user's notifications, newest first. */
  const list = (userId: string): Notification[] =>
    [...byId.values()].filter((n) => n.userId === userId).reverse();

  const reset = (): void => byId.clear();

  const snapshot = (): Notification[] => [...byId.values()];

  return { list, reset, snapshot };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
