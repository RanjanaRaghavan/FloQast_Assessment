import { expect, test } from '../../src/fixtures';
import * as userFactory from '../../src/factories/user.factory';

/**
 * TXN-RULE-01..04 — business rules on `POST /api/transactions`.
 * A rejected transaction must move no money and still be recorded.
 * See docs/TEST-PLAN.md.
 */
test.describe('Transactions — business rules', () => {
  test(
    'TXN-RULE-01: a transfer above the balance is rejected and moves no money',
    { tag: '@p0 @risk:money' },
    async ({ api, config }) => {
      const opening = config.openingBalanceMinor / 100;
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);

      const res = await api.asUser(alice.token).transactions.create({
        type: 'transfer',
        amount: opening + 1,
        recipientId: bob.user.id,
      });
      expect(res).toMatchErrorEnvelope('INSUFFICIENT_FUNDS');

      const aliceAfter = await api.asUser(alice.token).users.get(alice.user.id);
      const bobAfter = await api.asUser(bob.token).users.get(bob.user.id);
      expect(aliceAfter.body.balance).toEqualMoney(opening);
      expect(bobAfter.body.balance).toEqualMoney(opening);
    },
  );

  test(
    'TXN-RULE-02: a transfer to an unknown recipient is rejected and does not debit the sender',
    { tag: '@p0 @risk:money' },
    async ({ api, config }) => {
      const opening = config.openingBalanceMinor / 100;
      const alice = await userFactory.create(api);

      const res = await api.asUser(alice.token).transactions.create({
        type: 'transfer',
        amount: 50,
        recipientId: '11111111-1111-1111-1111-111111111111',
      });
      expect(res).toMatchErrorEnvelope('INVALID_RECIPIENT');

      const aliceAfter = await api.asUser(alice.token).users.get(alice.user.id);
      expect(aliceAfter.body.balance).toEqualMoney(opening);
    },
  );

  test(
    'TXN-RULE-03: a failed transaction is still recorded in history',
    { tag: '@p1' },
    async ({ api, config }) => {
      const opening = config.openingBalanceMinor / 100;
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);

      await api.asUser(alice.token).transactions.create({
        type: 'transfer',
        amount: opening + 100,
        recipientId: bob.user.id,
      });

      const list = await api.asUser(alice.token).transactions.list(alice.user.id);
      const failed = list.body.find((t) => t.status === 'failed');
      expect(failed).toBeDefined();
      expect(failed?.failureReason).toBe('INSUFFICIENT_FUNDS');
    },
  );

  test(
    'TXN-RULE-04: a transfer of the entire balance succeeds and leaves zero',
    { tag: '@p1 @risk:money' },
    async ({ api, config }) => {
      const opening = config.openingBalanceMinor / 100;
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);

      const res = await api.asUser(alice.token).transactions.create({
        type: 'transfer',
        amount: opening,
        recipientId: bob.user.id,
      });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('completed');

      const aliceAfter = await api.asUser(alice.token).users.get(alice.user.id);
      expect(aliceAfter.body.balance).toEqualMoney(0);
    },
  );
});
