import { expect, test } from '../../src/fixtures';
import * as userFactory from '../../src/factories/user.factory';

/**
 * USR-VAL-01..09 — `POST /api/users` input validation.
 *
 * Structurally invalid bodies carry `// @ts-expect-error intentionally invalid`:
 * the comment documents intent and fails the build if the request type ever
 * loosens enough to accept the bad shape. Well-typed-but-invalid values (a
 * malformed email string, an over-long name) need no suppression.
 */
test.describe('Users — validation', () => {
  test(
    'USR-VAL-01: missing name is rejected and names the field',
    { tag: '@p1' },
    async ({ api }) => {
      const { email, accountType } = userFactory.build();
      // @ts-expect-error intentionally invalid: name omitted
      const res = await api.users.create({ email, accountType });
      expect(res).toMatchErrorEnvelope('VALIDATION_ERROR', { field: 'name' });
    },
  );

  test(
    'USR-VAL-02: missing email is rejected and names the field',
    { tag: '@p1' },
    async ({ api }) => {
      const { name, accountType } = userFactory.build();
      // @ts-expect-error intentionally invalid: email omitted
      const res = await api.users.create({ name, accountType });
      expect(res).toMatchErrorEnvelope('VALIDATION_ERROR', { field: 'email' });
    },
  );

  test(
    'USR-VAL-03: a malformed email is rejected',
    { tag: '@p1' },
    async ({ api }) => {
      const res = await api.users.create(userFactory.build({ email: 'not-an-email' }));
      expect(res).toMatchErrorEnvelope('VALIDATION_ERROR', { field: 'email' });
    },
  );

  test(
    'USR-VAL-04: an unknown account type is rejected',
    { tag: '@p2' },
    async ({ api }) => {
      // @ts-expect-error intentionally invalid: not a member of the accountType union
      const res = await api.users.create(userFactory.build({ accountType: 'gold' }));
      expect(res).toMatchErrorEnvelope('VALIDATION_ERROR', { field: 'accountType' });
    },
  );

  test(
    'USR-VAL-05: an unknown extra field is rejected (strict schema)',
    { tag: '@p2' },
    async ({ api }) => {
      // @ts-expect-error intentionally invalid: extra property
      const res = await api.users.create({ ...userFactory.build(), isAdmin: true });
      expect(res).toMatchErrorEnvelope('VALIDATION_ERROR', { field: 'isAdmin' });
    },
  );

  test(
    'USR-VAL-06: a whitespace-only name is rejected',
    { tag: '@p2' },
    async ({ api }) => {
      const res = await api.users.create(userFactory.build({ name: '   ' }));
      expect(res).toMatchErrorEnvelope('VALIDATION_ERROR', { field: 'name' });
    },
  );

  test(
    'USR-VAL-07: an over-long name is rejected',
    { tag: '@p3' },
    async ({ api }) => {
      const res = await api.users.create(userFactory.build({ name: 'a'.repeat(300) }));
      expect(res).toMatchErrorEnvelope('VALIDATION_ERROR', { field: 'name' });
    },
  );

  test(
    'USR-VAL-08: a malformed JSON body still returns a well-formed error envelope',
    { tag: '@p2' },
    async ({ api }) => {
      const res = await api.raw.post('/api/users', undefined, {
        rawBody: '{"name": "Broken", "email":',
        contentType: 'application/json',
      });
      expect(res).toMatchErrorEnvelope('VALIDATION_ERROR');
    },
  );

  test(
    'USR-VAL-09: a non-JSON content type is rejected with 415',
    { tag: '@p3' },
    async ({ api }) => {
      const res = await api.raw.post('/api/users', userFactory.build(), {
        contentType: 'text/plain',
      });
      expect(res).toMatchErrorEnvelope('UNSUPPORTED_MEDIA_TYPE');
    },
  );
});
