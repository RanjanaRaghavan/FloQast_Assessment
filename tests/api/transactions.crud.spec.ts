import { expect, test } from '../../src/fixtures';
import * as userFactory from '../../src/factories/user.factory';
import * as txnFactory from '../../src/factories/transaction.factory';

/**
 * TXN-CRUD-01..07 — creating transactions and reading them back.
 * The P0 cases assert on money movement and conservation.
 * See docs/TEST-PLAN.md.
 */
test.describe('Transactions — CRUD', () => {
  test(
    'TXN-CRUD-01: a transfer debits the sender and credits the recipient',
    { tag: '@p0 @risk:money' },
    async ({ api, config }) => {
      const opening = config.openingBalanceMinor / 100;
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);

      const res = await api.asUser(alice.token).transactions.create({
        type: 'transfer',
        amount: 200,
        recipientId: bob.user.id,
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('completed');

      const aliceAfter = await api.asUser(alice.token).users.get(alice.user.id);
      const bobAfter = await api.asUser(bob.token).users.get(bob.user.id);
      expect(aliceAfter.body.balance).toEqualMoney(opening - 200);
      expect(bobAfter.body.balance).toEqualMoney(opening + 200);
    },
  );

  test(
    'TXN-CRUD-02: a transfer conserves the total balance',
    { tag: '@p0 @risk:money' },
    async ({ api, config }) => {
      const opening = config.openingBalanceMinor / 100;
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);

      await txnFactory.create(api, alice.token, { recipientId: bob.user.id, amount: 137.5 });

      const aliceAfter = await api.asUser(alice.token).users.get(alice.user.id);
      const bobAfter = await api.asUser(bob.token).users.get(bob.user.id);
      expect(aliceAfter.body.balance + bobAfter.body.balance).toEqualMoney(opening * 2);
    },
  );

  test(
    'TXN-CRUD-03: a new transaction appears in the sender history',
    { tag: '@p1' },
    async ({ api }) => {
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);

      const txn = await txnFactory.create(api, alice.token, { recipientId: bob.user.id });

      const list = await api.asUser(alice.token).transactions.list(alice.user.id);
      expect(list.status).toBe(200);
      expect(list.body.map((t) => t.id)).toContain(txn.id);
    },
  );

  test(
    'TXN-CRUD-04: history is ordered newest first',
    { tag: '@p2' },
    async ({ api }) => {
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);

      const created: string[] = [];
      for (let i = 0; i < 3; i++) {
        const txn = await txnFactory.create(api, alice.token, {
          recipientId: bob.user.id,
          amount: 10 + i,
        });
        created.push(txn.id);
      }

      const list = await api.asUser(alice.token).transactions.list(alice.user.id);
      expect(list.body.map((t) => t.id)).toEqual([...created].reverse());
    },
  );

  test(
    'TXN-CRUD-05: a user with no transactions gets an empty list',
    { tag: '@p2' },
    async ({ api, authedUser }) => {
      const list = await api.asUser(authedUser.token).transactions.list(authedUser.user.id);
      expect(list.status).toBe(200);
      expect(list.body).toEqual([]);
    },
  );

  test(
    'TXN-CRUD-06: the transaction record has the expected shape',
    { tag: '@p2' },
    async ({ api }) => {
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);

      const res = await api.asUser(alice.token).transactions.create({
        type: 'transfer',
        amount: 42.25,
        recipientId: bob.user.id,
      });

      expect(res.body).toMatchObject({
        id: expect.any(String),
        userId: alice.user.id,
        recipientId: bob.user.id,
        currency: 'USD',
        type: 'transfer',
        status: 'completed',
        failureReason: null,
      });
      expect(res.body.amount).toEqualMoney(42.25);
      expect(res.body.createdAt).toBeIsoDateString();
    },
  );

  test(
    'TXN-CRUD-07: a deposit increases the balance and needs no recipient',
    { tag: '@p3' },
    async ({ api, config }) => {
      const opening = config.openingBalanceMinor / 100;
      const user = await userFactory.create(api);

      const res = await api.asUser(user.token).transactions.create({ type: 'deposit', amount: 500 });

      expect(res.status).toBe(201);
      expect(res.body.recipientId).toBeNull();

      const after = await api.asUser(user.token).users.get(user.user.id);
      expect(after.body.balance).toEqualMoney(opening + 500);
    },
  );
});
