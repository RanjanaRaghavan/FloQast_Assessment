import { expect, test } from '../../src/fixtures';
import * as userFactory from '../../src/factories/user.factory';
import * as txnFactory from '../../src/factories/transaction.factory';
import { sleep } from '../../src/helpers/poll';

/**
 * NOTIF-01..05 — asynchronous notification delivery.
 *
 * WHY THESE TESTS POLL (and why the mock adds a deliberate delay):
 * In the real system, `POST /api/transactions` returns 201 the instant the
 * money moves; the notification is written later, after the `transaction.
 * completed` event crosses Redis to the Notification Service. Reading
 * `GET /api/notifications` immediately after the transaction races that hop.
 * The mock's event bus reproduces the lag (a small, jittered delay), so these
 * tests treat delivery as EVENTUALLY consistent:
 *   - "it arrived"    -> poll a read endpoint until it shows up, with a timeout
 *   - "it never came" -> wait the FULL budget, then assert absence
 * The same reasoning is on `EventBusOptions.delayMs` in
 * mock-services/src/domain/event-bus.ts.
 */
test.describe('Notification delivery', () => {
  test(
    'NOTIF-01: a completed transfer eventually produces a notification',
    { tag: '@p1 @async' },
    async ({ api, poll }) => {
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);
      const txn = await txnFactory.create(api, alice.token, { recipientId: bob.user.id });

      const notification = await poll(
        async () => {
          const res = await api.asUser(alice.token).notifications.list(alice.user.id);
          return res.body.find((n) => n.transactionId === txn.id) ?? null;
        },
        { description: `notification for transaction ${txn.id}` },
      );

      expect(notification.transactionId).toBe(txn.id);
    },
  );

  test(
    'NOTIF-02: a failed transaction produces no notification',
    { tag: '@p1 @async' },
    async ({ api, config }) => {
      const opening = config.openingBalanceMinor / 100;
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);

      const failed = await api.asUser(alice.token).transactions.create({
        type: 'transfer',
        amount: opening + 500,
        recipientId: bob.user.id,
      });
      expect(failed).toMatchErrorEnvelope('INSUFFICIENT_FUNDS');

      // Wait the entire delivery budget before concluding "none".
      await sleep(config.asyncPollTimeoutMs);

      const notes = await api.asUser(alice.token).notifications.list(alice.user.id);
      expect(notes.body).toHaveLength(0);
    },
  );

  test(
    'NOTIF-03: the notification payload references the transaction correctly',
    { tag: '@p2 @async' },
    async ({ api, poll }) => {
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);
      const txn = await txnFactory.create(api, alice.token, {
        recipientId: bob.user.id,
        amount: 88.4,
      });

      const notification = await poll(async () => {
        const res = await api.asUser(alice.token).notifications.list(alice.user.id);
        return res.body.find((n) => n.transactionId === txn.id) ?? null;
      });

      expect(notification).toMatchObject({
        userId: alice.user.id,
        transactionId: txn.id,
        kind: 'transfer_sent',
        channel: 'email',
      });
      expect(notification.amount).toEqualMoney(88.4);
    },
  );

  test(
    'NOTIF-04: the recipient also gets a notification',
    { tag: '@p2 @async' },
    async ({ api, poll }) => {
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);
      const txn = await txnFactory.create(api, alice.token, { recipientId: bob.user.id });

      const notification = await poll(async () => {
        const res = await api.asUser(bob.token).notifications.list(bob.user.id);
        return res.body.find((n) => n.transactionId === txn.id) ?? null;
      });

      expect(notification).toMatchObject({
        userId: bob.user.id,
        kind: 'transfer_received',
      });
    },
  );

  test(
    'NOTIF-05: a user cannot read another user notifications',
    { tag: '@p3 @risk:authz' },
    async ({ api }) => {
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);

      const res = await api.asUser(alice.token).notifications.list(bob.user.id);

      expect(res).toMatchErrorEnvelope('FORBIDDEN');
    },
  );
});
