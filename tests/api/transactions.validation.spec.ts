import { expect, test } from '../../src/fixtures';
import * as userFactory from '../../src/factories/user.factory';

/**
 * TXN-VAL-01..11 — `POST /api/transactions` input validation.
 * P0 cases (negative / zero amount) are money-safety checks.
 * See docs/TEST-PLAN.md.
 */
test.describe('Transactions — validation', () => {
  test('TXN-VAL-01: missing amount is rejected', { tag: '@p1' }, async ({ api, authedUser }) => {
    // @ts-expect-error intentionally invalid: amount omitted
    const res = await api.asUser(authedUser.token).transactions.create({ type: 'deposit' });
    expect(res).toMatchErrorEnvelope('VALIDATION_ERROR', { field: 'amount' });
  });

  test('TXN-VAL-02: missing type is rejected', { tag: '@p1' }, async ({ api, authedUser }) => {
    // @ts-expect-error intentionally invalid: type omitted
    const res = await api.asUser(authedUser.token).transactions.create({ amount: 10 });
    expect(res).toMatchErrorEnvelope('VALIDATION_ERROR', { field: 'type' });
  });

  test(
    'TXN-VAL-03: a transfer without a recipient is rejected',
    { tag: '@p1' },
    async ({ api, authedUser }) => {
      const res = await api.asUser(authedUser.token).transactions.create({
        type: 'transfer',
        amount: 10,
      });
      expect(res).toMatchErrorEnvelope('VALIDATION_ERROR', { field: 'recipientId' });
    },
  );

  test(
    'TXN-VAL-04: a negative amount is rejected',
    { tag: '@p0 @risk:money' },
    async ({ api, authedUser }) => {
      const res = await api.asUser(authedUser.token).transactions.create({
        type: 'deposit',
        amount: -5,
      });
      expect(res).toMatchErrorEnvelope('VALIDATION_ERROR', { field: 'amount' });
    },
  );

  test(
    'TXN-VAL-05: a zero amount is rejected',
    { tag: '@p0 @risk:money' },
    async ({ api, authedUser }) => {
      const res = await api.asUser(authedUser.token).transactions.create({
        type: 'deposit',
        amount: 0,
      });
      expect(res).toMatchErrorEnvelope('VALIDATION_ERROR', { field: 'amount' });
    },
  );

  test(
    'TXN-VAL-06: an amount with more than 2 decimal places is rejected',
    { tag: '@p1 @risk:money' },
    async ({ api, authedUser }) => {
      const res = await api.asUser(authedUser.token).transactions.create({
        type: 'deposit',
        amount: 10.005,
      });
      expect(res).toMatchErrorEnvelope('VALIDATION_ERROR', { field: 'amount' });
    },
  );

  test(
    'TXN-VAL-07: a string amount is rejected',
    { tag: '@p1' },
    async ({ api, authedUser }) => {
      const res = await api.asUser(authedUser.token).transactions.create({
        type: 'deposit',
        // @ts-expect-error intentionally invalid: amount must be a number
        amount: '100',
      });
      expect(res).toMatchErrorEnvelope('VALIDATION_ERROR', { field: 'amount' });
    },
  );

  test('TXN-VAL-08: an unknown type is rejected', { tag: '@p2' }, async ({ api, authedUser }) => {
    // @ts-expect-error intentionally invalid: not a member of the type union
    const res = await api.asUser(authedUser.token).transactions.create({ type: 'wire', amount: 10 });
    expect(res).toMatchErrorEnvelope('VALIDATION_ERROR', { field: 'type' });
  });

  test(
    'TXN-VAL-09: a transfer to yourself is rejected',
    { tag: '@p2' },
    async ({ api, authedUser }) => {
      const res = await api.asUser(authedUser.token).transactions.create({
        type: 'transfer',
        amount: 10,
        recipientId: authedUser.user.id,
      });
      expect(res).toMatchErrorEnvelope('VALIDATION_ERROR', { field: 'recipientId' });
    },
  );

  test(
    'TXN-VAL-10: an amount at or above the per-transaction limit is rejected',
    { tag: '@p3' },
    async ({ api, authedUser }) => {
      // Limit is $1,000,000 (DEFAULT_MAX_TRANSFER_MINOR, docs/DESIGN.md §4.4).
      const res = await api.asUser(authedUser.token).transactions.create({
        type: 'deposit',
        amount: 1_000_000,
      });
      expect(res).toMatchErrorEnvelope('LIMIT_EXCEEDED');
    },
  );

  test(
    'TXN-VAL-11: hostile input is handled cleanly, never a 500',
    { tag: '@p3 @security' },
    async ({ api }) => {
      const alice = await userFactory.create(api);

      const res = await api.asUser(alice.token).transactions.create({
        type: 'transfer',
        amount: 10,
        recipientId: "'; DROP TABLE users; -- <script>alert(1)</script>",
      });

      // Treated as an ordinary unknown recipient: 422 + well-formed envelope,
      // never a 500 or an unhandled crash.
      expect(res).toMatchErrorEnvelope('INVALID_RECIPIENT');
    },
  );
});
