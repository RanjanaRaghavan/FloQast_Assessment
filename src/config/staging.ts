import type { EnvProfileInput } from './env';

/**
 * A deployed environment (placeholder). The suite runs BLACK-BOX here:
 *   - Playwright does NOT boot anything (`startMockServer: false`)
 *   - the `/test/*` control plane is off-limits (`allowTestControlPlane: false`),
 *     so setup/teardown must go through the public API only
 *   - real URLs and any secret come from env / CI secrets, never this file
 *
 * Provide at run time:
 *   API_BASE_URL=...  UI_BASE_URL=...  ADMIN_TOKEN=...  [JWT_SECRET=...]
 *
 * Black-box specs must not assert on `jwtSecret` or `openingBalanceMinor` —
 * those are mock-only knowns and are placeholders here.
 */
export const stagingConfig: EnvProfileInput = {
  apiBaseURL: 'https://api.staging.example.com',
  uiBaseURL: 'https://app.staging.example.com',
  mockServerPort: 0, // unused — nothing is booted locally

  testTimeoutMs: 60000,
  expectTimeoutMs: 10000,
  actionTimeoutMs: 20000,
  navigationTimeoutMs: 30000,
  asyncPollTimeoutMs: 15000, // real network + real queue latency
  asyncPollIntervalMs: 500,

  retries: 2,

  startMockServer: false,
  allowTestControlPlane: false,

  jwtSecret: 'unused-in-staging-override-via-env',
  openingBalanceMinor: 0, // unknown for a real environment; do not assert
  notificationDelayMs: 0, // real system owns delivery timing
};
