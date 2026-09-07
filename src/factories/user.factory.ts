import { faker } from '@faker-js/faker';

import type { ApiClient, CreateUserRequest } from '../clients/api';
import type { UserResponse } from '../clients/types';

/**
 * Test data for users.
 *
 *  - `build()` — a valid request object, no I/O. For validation / negative
 *    specs that only need a well-formed body to mutate.
 *  - `create()` — POSTs the user and (for `transfer` tests) logs it in,
 *    returning `{ user, token }`.
 *
 * Every field is unique by default (faker + a uuid in the email), so specs
 * running in parallel never collide and there is no shared mutable fixture.
 */

export type BuildUserOptions = Partial<CreateUserRequest>;

export interface CreatedUser {
  user: UserResponse;
  token: string;
}

/** A valid `POST /api/users` body with unique, overridable fields. */
export function build(overrides: BuildUserOptions = {}): CreateUserRequest {
  return {
    name: faker.person.fullName(),
    email: `qa+${faker.string.uuid()}@test.local`,
    accountType: faker.helpers.arrayElement(['free', 'premium'] as const),
    ...overrides,
  };
}

/**
 * Create a user via the API and sign in. Throws if either call fails — a
 * factory that half-worked would produce confusing downstream failures.
 */
export async function create(
  api: ApiClient,
  overrides: BuildUserOptions = {},
): Promise<CreatedUser> {
  const body = build(overrides);

  const created = await api.users.create(body);
  if (created.status !== 201) {
    throw new Error(
      `user.factory.create: POST /api/users returned ${created.status} — ${JSON.stringify(created.body)}`,
    );
  }

  const login = await api.auth.login(body.email);
  if (login.status !== 200) {
    throw new Error(
      `user.factory.create: login for ${body.email} returned ${login.status} — ${JSON.stringify(login.body)}`,
    );
  }

  return { user: created.body, token: login.body.token };
}
