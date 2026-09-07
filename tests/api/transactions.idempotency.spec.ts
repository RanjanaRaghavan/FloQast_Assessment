import { randomUUID } from 'node:crypto';

import { expect, test } from '../../src/fixtures';
import * as userFactory from '../../src/factories/user.factory';

/**
 * TXN-IDMP-01..05 — a retried `POST /api/transactions` with the same
 * `Idempotency-Key` must never move money twice.
 * See docs/TEST-PLAN.md.
 */
test.describe('Transactions — idempotency', () => {
  test(
    'TXN-IDMP-01: replaying a request with the same key moves money once',
    { tag: '@p0 @risk:money' },
    async ({ api, config }) => {
      const opening = config.openingBalanceMinor / 100;
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);
      const key = randomUUID();
      const body = { type: 'transfer' as const, amount: 75, recipientId: bob.user.id };

      const first = await api.asUser(alice.token).transactions.create(body, { idempotencyKey: key });
      const replay = await api.asUser(alice.token).transactions.create(body, { idempotencyKey: key });

      expect(first.status).toBe(201);
      expect(replay.status).toBe(201);
      expect(replay.body).toEqual(first.body); // identical response

      const list = await api.asUser(alice.token).transactions.list(alice.user.id);
      expect(list.body).toHaveLength(1);

      const aliceAfter = await api.asUser(alice.token).users.get(alice.user.id);
      expect(aliceAfter.body.balance).toEqualMoney(opening - 75);
    },
  );

  test(
    'TXN-IDMP-02: the same key with a different body is a conflict',
    { tag: '@p0 @risk:money' },
    async ({ api }) => {
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);
      const key = randomUUID();

      await api.asUser(alice.token).transactions.create(
        { type: 'transfer', amount: 10, recipientId: bob.user.id },
        { idempotencyKey: key },
      );
      const conflict = await api.asUser(alice.token).transactions.create(
        { type: 'transfer', amount: 20, recipientId: bob.user.id },
        { idempotencyKey: key },
      );

      expect(conflict).toMatchErrorEnvelope('IDEMPOTENCY_CONFLICT');
    },
  );

  test(
    'TXN-IDMP-03: different keys with the same body create distinct transactions',
    { tag: '@p1' },
    async ({ api }) => {
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);
      const body = { type: 'transfer' as const, amount: 10, recipientId: bob.user.id };

      const a = await api.asUser(alice.token).transactions.create(body, { idempotencyKey: randomUUID() });
      const b = await api.asUser(alice.token).transactions.create(body, { idempotencyKey: randomUUID() });

      expect(a.body.id).not.toBe(b.body.id);
      const list = await api.asUser(alice.token).transactions.list(alice.user.id);
      expect(list.body).toHaveLength(2);
    },
  );

  test(
    'TXN-IDMP-04: without a key, each call creates a new transaction',
    { tag: '@p1' },
    async ({ api }) => {
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);
      const body = { type: 'transfer' as const, amount: 10, recipientId: bob.user.id };

      const a = await api.asUser(alice.token).transactions.create(body);
      const b = await api.asUser(alice.token).transactions.create(body);

      expect(a.body.id).not.toBe(b.body.id);
    },
  );

  test(
    'TXN-IDMP-05: concurrent identical requests with one key create exactly one transaction',
    { tag: '@p2 @risk:money' },
    async ({ api, config }) => {
      const opening = config.openingBalanceMinor / 100;
      const alice = await userFactory.create(api);
      const bob = await userFactory.create(api);
      const key = randomUUID();
      const body = { type: 'transfer' as const, amount: 30, recipientId: bob.user.id };

      const responses = await Promise.all(
        Array.from({ length: 8 }, () =>
          api.asUser(alice.token).transactions.create(body, { idempotencyKey: key }),
        ),
      );

      const ids = new Set(responses.map((r) => r.body.id));
      expect(ids.size).toBe(1);

      const list = await api.asUser(alice.token).transactions.list(alice.user.id);
      expect(list.body).toHaveLength(1);

      const aliceAfter = await api.asUser(alice.token).users.get(alice.user.id);
      expect(aliceAfter.body.balance).toEqualMoney(opening - 30);
    },
  );
});
