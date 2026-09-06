import type { EnvProfileInput } from './env';

const PORT = 4010;

/**
 * GitHub Actions. Same self-booted mock stack as local, but with a little
 * more timing slack (shared runners are slower and noisier) and a small
 * number of retries to absorb pure infra flakiness — never real defects.
 */
export const ciConfig: EnvProfileInput = {
  apiBaseURL: `http://localhost:${PORT}`,
  uiBaseURL: `http://localhost:${PORT}/app`,
  mockServerPort: PORT,

  testTimeoutMs: 45000,
  expectTimeoutMs: 7000,
  actionTimeoutMs: 15000,
  navigationTimeoutMs: 20000,
  asyncPollTimeoutMs: 8000,
  asyncPollIntervalMs: 200,

  retries: 2,

  startMockServer: true,
  allowTestControlPlane: true,

  jwtSecret: 'ci-secret-not-for-production',
  openingBalanceMinor: 100000, // $1000.00
  notificationDelayMs: 150,
};
