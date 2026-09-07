import type { ApiResponse } from './http';
import type { HttpClient } from './http';
import type { AccountType, ControlPlaneState, UserResponse } from './types';

/**
 * Client for the `/test/*` endpoints — a TEST AFFORDANCE, not part of the
 * product API. Only mounted when `config.allowTestControlPlane` is true
 * (local / ci); against a real deployment these calls 404 and the suite must
 * fall back to public-API setup/teardown.
 *
 * Unlike `ApiClient`, these methods THROW on an unexpected status: control-plane
 * calls are test setup, so a failure here should abort the test loudly rather
 * than let it run against a dirty or wrong environment.
 */

export interface SeedUser {
  name?: string;
  email?: string;
  accountType?: AccountType;
  /** Decimal (e.g. 250.00). Converted to minor units on the wire. */
  balance?: number;
}

export interface SeedRequest {
  users?: SeedUser[];
}

function expectStatus(res: ApiResponse, expected: number, action: string): void {
  if (res.status === expected) return;
  throw new Error(
    `Control plane: "${action}" expected HTTP ${expected} but got ${res.status}.\n` +
      `The /test/* endpoints exist only where allowTestControlPlane is true. ` +
      `Check TEST_ENV.\nResponse body: ${JSON.stringify(res.body)}`,
  );
}

export class ControlPlaneClient {
  constructor(private readonly http: HttpClient) {}

  /** Wipe all users, transactions, notifications and idempotency keys. */
  async reset(): Promise<void> {
    const res = await this.http.post('/test/reset');
    expectStatus(res, 204, 'reset');
  }

  /** Create a known set of users; returns them as the API would serialize them. */
  async seed(request: SeedRequest = {}): Promise<{ users: UserResponse[] }> {
    const payload = {
      users: request.users?.map(({ balance, ...rest }) => ({
        ...rest,
        ...(balance === undefined ? {} : { balanceMinor: Math.round(balance * 100) }),
      })),
    };
    const res = await this.http.post<{ users: UserResponse[] }>('/test/seed', payload);
    expectStatus(res, 200, 'seed');
    return res.body;
  }

  /** Full introspection of server state — for debugging and a few assertions. */
  async state(): Promise<ControlPlaneState> {
    const res = await this.http.get<ControlPlaneState>('/test/state');
    expectStatus(res, 200, 'state');
    return res.body;
  }
}
