import { expect, test } from '../../src/fixtures';
import * as userFactory from '../../src/factories/user.factory';

/**
 * USR-CRUD-01..06 — user creation and retrieval.
 * See docs/TEST-PLAN.md.
 */
test.describe('Users — CRUD', () => {
  test(
    'USR-CRUD-01: valid body creates a user with an opening balance',
    { tag: '@p1' },
    async ({ api, config }) => {
      const body = userFactory.build({ accountType: 'premium' });

      const res = await api.users.create(body);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: body.name,
        email: body.email,
        accountType: 'premium',
      });
      expect(res.body.id).toEqual(expect.any(String));
      expect(res.body.balance).toEqualMoney(config.openingBalanceMinor / 100);
      expect(res.body.createdAt).toBeIsoDateString();
    },
  );

  test(
    'USR-CRUD-02: both account types are accepted',
    { tag: '@p2' },
    async ({ api }) => {
      for (const accountType of ['free', 'premium'] as const) {
        const res = await api.users.create(userFactory.build({ accountType }));
        expect(res.status).toBe(201);
        expect(res.body.accountType).toBe(accountType);
      }
    },
  );

  test(
    'USR-CRUD-03: a user can read their own profile',
    { tag: '@p1' },
    async ({ api, authedUser }) => {
      const res = await api.asUser(authedUser.token).users.get(authedUser.user.id);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: authedUser.user.id,
        name: authedUser.user.name,
        email: authedUser.user.email,
      });
    },
  );

  test(
    'USR-CRUD-04: reading another id is forbidden and does not disclose existence',
    { tag: '@p1' },
    async ({ api, authedUser }) => {
      const other = await userFactory.create(api);

      const real = await api.asUser(authedUser.token).users.get(other.user.id);
      const madeUp = await api.asUser(authedUser.token).users.get('00000000-0000-0000-0000-000000000000');

      expect(real).toMatchErrorEnvelope('FORBIDDEN');
      expect(madeUp).toMatchErrorEnvelope('FORBIDDEN');
      // Same response for a real and a non-existent id — no 404 vs 403 oracle.
      expect(real.status).toBe(madeUp.status);
    },
  );

  test(
    'USR-CRUD-05: the opening balance matches configuration',
    { tag: '@p2' },
    async ({ api, config }) => {
      const res = await api.users.create(userFactory.build());
      expect(res.body.balance).toEqualMoney(config.openingBalanceMinor / 100);
    },
  );

  test(
    'USR-CRUD-06: the same email cannot be registered twice',
    { tag: '@p3' },
    async ({ api }) => {
      const body = userFactory.build();

      const first = await api.users.create(body);
      const second = await api.users.create(body);

      expect(first.status).toBe(201);
      expect(second).toMatchErrorEnvelope('EMAIL_EXISTS');
    },
  );
});
