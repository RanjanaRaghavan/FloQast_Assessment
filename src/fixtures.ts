import { request as pwRequest, test as base } from '@playwright/test';

import { ApiClient } from './clients/api';
import { ControlPlaneClient } from './clients/control-plane';
import { HttpClient, RequestLog } from './clients/http';
import { type EnvConfig, loadEnvConfig } from './config/env';
import type { CreatedUser } from './factories/user.factory';
import * as userFactory from './factories/user.factory';
import { type WaitForOptions, waitFor } from './helpers/poll';

/**
 * The test entry point. Specs do:
 *
 *   import { test, expect } from '../../src/fixtures';
 *
 * and get, per test:
 *   - `config`       — the resolved environment config
 *   - `api`          — an ApiClient (own request context, baseURL = apiBaseURL)
 *   - `controlPlane` — the /test/* client (throws if the env disables it)
 *   - `poll`         — waitFor pre-bound to this env's async timeouts
 *   - `authedUser`   — a freshly created + logged-in user
 *
 * Every API call is recorded and attached to the HTML report ONLY when the
 * test fails.
 */

export { expect } from './assertions/matchers';

export type PollFn = <T>(
  fn: () => T | Promise<T>,
  options?: WaitForOptions,
) => Promise<NonNullable<T>>;

interface Fixtures {
  config: EnvConfig;
  requestLog: RequestLog;
  api: ApiClient;
  controlPlane: ControlPlaneClient;
  poll: PollFn;
  authedUser: CreatedUser;
}

export const test = base.extend<Fixtures>({
  config: async ({}, use) => {
    await use(loadEnvConfig());
  },

  // One request log per test. Attached to the report only on an unexpected
  // outcome, so green runs stay free of noise.
  requestLog: async ({}, use, testInfo) => {
    const log = new RequestLog();
    await use(log);
    if (testInfo.status !== testInfo.expectedStatus && log.count > 0) {
      await testInfo.attach('api-calls', { body: log.format(), contentType: 'text/plain' });
    }
  },

  api: async ({ config, requestLog }, use) => {
    const context = await pwRequest.newContext({ baseURL: config.apiBaseURL });
    await use(new ApiClient(new HttpClient(context, requestLog)));
    await context.dispose();
  },

  controlPlane: async ({ config, requestLog }, use) => {
    if (!config.allowTestControlPlane) {
      throw new Error(
        `The "controlPlane" fixture is unavailable for TEST_ENV=${config.name} ` +
          `(allowTestControlPlane is false). Arrange state through the public API instead.`,
      );
    }
    const context = await pwRequest.newContext({ baseURL: config.apiBaseURL });
    await use(new ControlPlaneClient(new HttpClient(context, requestLog)));
    await context.dispose();
  },

  poll: async ({ config }, use) => {
    const bound: PollFn = (fn, options) =>
      waitFor(fn, {
        timeoutMs: config.asyncPollTimeoutMs,
        intervalMs: config.asyncPollIntervalMs,
        ...options,
      });
    await use(bound);
  },

  authedUser: async ({ api }, use) => {
    await use(await userFactory.create(api));
  },
});
