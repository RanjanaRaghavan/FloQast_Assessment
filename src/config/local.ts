import type { EnvProfileInput } from './env';

const PORT = 4010;

/**
 * Developer machine. Playwright boots the mock stack, the test control plane
 * is available, retries are off so flakiness is visible, and the async
 * notification lag is small to keep the suite quick.
 */
export const localConfig: EnvProfileInput = {
  apiBaseURL: `http://localhost:${PORT}`,
  uiBaseURL: `http://localhost:${PORT}/app/`,
  mockServerPort: PORT,

  testTimeoutMs: 30000,
  expectTimeoutMs: 5000,
  actionTimeoutMs: 10000,
  navigationTimeoutMs: 15000,
  asyncPollTimeoutMs: 5000,
  asyncPollIntervalMs: 150,

  retries: 0,

  startMockServer: true,
  allowTestControlPlane: true,

  jwtSecret: 'local-dev-secret-not-for-production',
  openingBalanceMinor: 100000, // $1000.00
  notificationDelayMs: 150,
};
