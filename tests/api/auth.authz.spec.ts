import { expect, test } from '../../src/fixtures';
import * as userFactory from '../../src/factories/user.factory';
import * as txnFactory from '../../src/factories/transaction.factory';
import {
  GARBAGE_TOKEN,
  expiredToken,
  foreignSecretToken,
  tamperedToken,
} from '../../src/helpers/tokens';

/**
 * AUTH-01..06 — authentication.
 * AUTHZ-06..09 — one user must never reach another user's data.
 * See docs/TEST-PLAN.md.
 */
test.describe('Authentication', () => {
  test('AUTH-01: login with a known email returns a token', { tag: '@p1' }, async ({ api }) => {
    const { user } = await userFactory.create(api);

    const res = await api.auth.login(user.email);

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.id).toBe(user.id);
  });

  test('AUTH-06: login with an unknown email is 404', { tag: '@p1' }, async ({ api }) => {
    const res = await api.auth.login(`nobody+${Date.now()}@test.local`);
    expect(res).toMatchErrorEnvelope('NOT_FOUND');
  });

  test('AUTH-02: a request with no token is rejected', { tag: '@p1' }, async ({ api }) => {
    const res = await api.users.get('any-id');
    expect(res).toMatchErrorEnvelope('UNAUTHENTICATED');
  });

  test('AUTH-03: a non-JWT token is rejected', { tag: '@p1' }, async ({ api }) => {
    const res = await api.users.get('any-id', { token: GARBAGE_TOKEN });
    expect(res).toMatchErrorEnvelope('UNAUTHENTICATED');
  });

  test('AUTH-04: a tampered signature is rejected', { tag: '@p1' }, async ({ api }) => {
    const { user, token } = await userFactory.create(api);

    const res = await api.users.get(user.id, { token: tamperedToken(token) });

    expect(res).toMatchErrorEnvelope('UNAUTHENTICATED');
  });

  test('AUTH-05: an expired token is rejected', { tag: '@p1' }, async ({ api, authedUser }) => {
    const res = await api.users.get(authedUser.user.id, { token: expiredToken(authedUser.user.id) });
    expect(res).toMatchErrorEnvelope('UNAUTHENTICATED');
  });

  test('AUTH-05b: a token signed with the wrong secret is rejected', { tag: '@p1' }, async ({ api, authedUser }) => {
    const res = await api.users.get(authedUser.user.id, {
      token: foreignSecretToken(authedUser.user.id),
    });
    expect(res).toMatchErrorEnvelope('UNAUTHENTICATED');
  });
});

test.describe('Authorization — cross-user access', () => {
  test('AUTHZ-06: a user cannot read another user profile', { tag: '@p0 @risk:authz' }, async ({ api }) => {
    const alice = await userFactory.create(api);
    const bob = await userFactory.create(api);

    const res = await api.asUser(alice.token).users.get(bob.user.id);

    expect(res).toMatchErrorEnvelope('FORBIDDEN');
  });

  test('AUTHZ-07: a user cannot list another user transactions', { tag: '@p0 @risk:authz' }, async ({ api }) => {
    const alice = await userFactory.create(api);
    const bob = await userFactory.create(api);

    const res = await api.asUser(alice.token).transactions.list(bob.user.id);

    expect(res).toMatchErrorEnvelope('FORBIDDEN');
  });

  test('AUTHZ-08: a user cannot create a transaction as another user', { tag: '@p0 @risk:authz' }, async ({ api }) => {
    const alice = await userFactory.create(api);
    const bob = await userFactory.create(api);

    const res = await api.asUser(alice.token).transactions.create({
      userId: bob.user.id,
      type: 'transfer',
      amount: 10,
      recipientId: alice.user.id,
    });

    expect(res).toMatchErrorEnvelope('FORBIDDEN');
  });

  test('AUTHZ-09: a spoofed x-user-id header is ignored', { tag: '@p2 @risk:authz' }, async ({ api }) => {
    const alice = await userFactory.create(api);
    const bob = await userFactory.create(api);
    await txnFactory.create(api, alice.token, { recipientId: bob.user.id, amount: 5 });

    // The spoofed header does not grant access to Bob's data...
    const denied = await api
      .asUser(alice.token)
      .users.get(bob.user.id, { headers: { 'x-user-id': bob.user.id } });
    expect(denied).toMatchErrorEnvelope('FORBIDDEN');

    // ...and does not change whose data Alice sees for her own call.
    const ownList = await api
      .asUser(alice.token)
      .transactions.list(alice.user.id, { headers: { 'x-user-id': bob.user.id } });
    expect(ownList.status).toBe(200);
    expect(ownList.body).toHaveLength(1);
    expect(ownList.body[0]?.userId).toBe(alice.user.id);
  });
});
